import { concatMap, EMPTY, first, ignoreElements, map, merge, Observable, of, reduce, share, Subject, tap } from "rxjs";
import { logger } from 'shared/logger';
import { ObservableMap } from "shared/rx/observables/map";
import { MippyConfig } from "../config";
import { StreamSynthesisResult, streamSynthesizeVoice } from "../data/tts/synthesize-stream";
import { AudioRepository, AudioStream } from "../plugins/audio-socket";
import { MippyPartialResult } from "./chat-gpt-brain";
import { MippyBrain, MippyPrompts, Prompt } from "./mippy-brain";

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

function mapAudioStream<In extends StreamSynthesisResult>(stream: AudioStream) {
    return map((result: In) => ({
        id: stream.id,
        audio: {
            duration: stream.duration,
            finished: false,
        },
        message: {
            text: result.text ?? "",
            finished: true
        },
    }))
}

function accumulatePartialMessage() {
    return reduce((state, event: MippyStreamEvent) => ({
        text: state.text + event.message.text,
        id: event.id,
        duration: event.audio.duration,
    }), { text: "", id: "", duration: 0 })
}

function concatMessages(tts: AudioRepository, history: ObservableMap<string, MippyStreamEventHistoryMessage>) {
    return concatMap(
        (partial: Observable<MippyPartialResult>) => {
            const stream = tts.create();
            const event$ = streamSynthesizeVoice(partial.pipe(map(p => p.text))).pipe(
                accumulateAudioStream(stream),
                mapAudioStream(stream),
                share()
            )
            const completeMessage$ = event$.pipe(
                accumulatePartialMessage(),
                tap(event => history.set(event.id, event)),
                ignoreElements()
            );
            return merge(event$, completeMessage$);
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

    constructor(brain: MippyBrain, config: MippyConfig, tts: AudioRepository) {
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
            concatMessages(tts, this.messageHistory$),
            share()
        );
        this.enabled = config.enabled;
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
}