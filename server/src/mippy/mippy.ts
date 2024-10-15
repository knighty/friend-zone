import { concatMap, EMPTY, first, ignoreElements, map, merge, Observable, of, reduce, share, Subject, tap, timeout } from "rxjs";
import { logger } from 'shared/logger';
import { ObservableMap } from "shared/rx";
import { MippyConfig } from "../config";
import { StreamSynthesisResult, streamSynthesizeVoice } from "../data/tts/synthesize-stream";
import { AudioRepository, AudioStream } from "../plugins/audio-socket";
import { MippyPartialResult } from "./chat-gpt-brain";
import { MippyBrain, MippyPrompts, Prompt } from "./mippy-brain";
import { MippyPermissions, MippyPluginConfig, MippyPluginDefinition } from "./plugins/plugins";

const log = logger("mippy");

export type MippyStreamEvent = {
    id: string,
    audio: {
        duration: number,
        finished: boolean,
    },
    message: {
        text: string
        finished: boolean,
    },
}

export type MippyStreamEventHistoryMessage = {
    text: string,
    id: string,
    duration: number
}

function accumulateAudioStream<In extends StreamSynthesisResult>(stream: AudioStream) {
    return tap<In>({
        next: (result) => {
            if (result.buffer)
                stream.append(result.buffer)
        },
        complete: () => {
            stream.complete()
        },
    })
}

function accumulatePartialMessage() {
    return reduce((state, event: MippyStreamEvent) => ({
        text: state.text + event.message.text,
        id: event.id,
        duration: event.audio.duration,
    }), { text: "", id: "", duration: 0 })
}

function synthesizeVoice(audioRepository: AudioRepository, inputStream: Observable<string>) {
    const stream = audioRepository.create();
    return streamSynthesizeVoice(inputStream).pipe(
        accumulateAudioStream(stream),
        map(value => ({
            id: stream.id,
            audio: {
                duration: stream.duration,
                finished: false,
            },
            message: {
                text: value.text ?? "",
                finished: true
            },
        })),
        share()
    )
}

function concatMessages(tts: AudioRepository, history: ObservableMap<string, MippyStreamEventHistoryMessage>) {
    return concatMap(
        (partial: Observable<MippyPartialResult>) => {
            const event$ = synthesizeVoice(tts, partial.pipe(map(p => p.text)));
            const completeMessage$ = event$.pipe(
                accumulatePartialMessage(),
                tap(event => history.set(event.id, event)),
                ignoreElements()
            );
            return merge(event$, completeMessage$).pipe(
                timeout({
                    each: 60000,
                    with: () => {
                        log.error("Timeout generating audio");
                        return EMPTY;
                    }
                })
            );
        }
    )
}

type MippyStreamEventHandler = (history: ObservableMap<string, MippyStreamEventHistoryMessage>) => Observable<MippyStreamEvent>;

export class Mippy {
    enabled: boolean;
    brain: MippyBrain;
    streamEvent$: Observable<MippyStreamEvent>;
    messageHistory$ = new ObservableMap<string, MippyStreamEventHistoryMessage>()
    manualMessage$ = new Subject<{ text: string }>();
    audioId = 0;
    permissions: MippyPermissions[];
    config: MippyConfig;

    constructor(brain: MippyBrain, config: MippyConfig, audioRepository: AudioRepository, permissions: MippyPermissions[]) {
        this.brain = brain;
        log.info("Created Mippy");
        this.brain.receive().subscribe();
        const brainMessage$ = this.brain.receivePartials();
        const manualMessage$ = this.manualMessage$.pipe(
            map(message => of({
                text: message.text,
                finished: true,
            }))
        )
        const message$ = merge(brainMessage$, manualMessage$);
        this.streamEvent$ = message$.pipe(
            concatMessages(audioRepository, this.messageHistory$),
            share()
        );
        this.enabled = config.enabled;
        this.permissions = permissions;
        this.config = config;
    }

    say(text: string) {
        this.manualMessage$.next({ text });
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, prompt: Omit<Prompt, "text"> = {}) {
        if (this.enabled)
            this.brain.ask(event, data, {
                ...prompt,
            });
    }

    listen() {
        return this.enabled ? this.streamEvent$ : EMPTY;
    }

    observeHistory() {
        return merge(
            this.messageHistory$.keyValues$.pipe(
                first(),
            ),
            this.messageHistory$.keyCreated$
        )
    }

    isFilteredText(text: string) {
        if (this.config.filter) {
            if (text.match(this.config.filter)) {
                return true;
            }
        }
        return false;
    }

    plugins: Record<string, {
        name: string,
        config: MippyPluginConfig<any>
    }> = {};

    async initPlugins(plugins: Record<string, MippyPluginDefinition>) {
        for (let pluginId in plugins) {
            const plugin = plugins[pluginId];
            let hasPermission = true;
            if (plugin.permissions) {
                for (let permission of plugin.permissions) {
                    if (!this.permissions.includes(permission)) {
                        hasPermission = false;
                    }
                }
            }
            if (hasPermission) {
                log.info(`Initialising plugin: ${plugin.name}...`);
                const config = new MippyPluginConfig(pluginId, plugin.config ?? {});
                const p = await plugin.init(this, config);
                this.plugins[pluginId] = {
                    name: plugin.name,
                    config: config
                }
            }
        }
    }
}