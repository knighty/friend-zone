import { FastifyInstance } from "fastify";
import { BehaviorSubject, EMPTY, Observable, Subject, concatMap, ignoreElements, map, merge, of, reduce, share, switchMap, tap, timeout, timer, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { concatMapPriority, tapFirst } from "shared/rx";
import { StreamSynthesisResult, streamSynthesizeVoice } from "../../../data/tts/synthesize-stream";
import ejsLayout from "../../../layout";
import { AudioRepository, AudioStream } from "../../../plugins/audio-socket";
import { socket } from "../../../plugins/socket";
import { initTtsRouter } from "../../../routes/tts";
import { getManifestPath } from "../../../utils";
import { MippyPartialResult } from "../../chat-gpt-brain";
import { MippyPlugin, MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const log = logger("mippy-voice-plugin");

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

function synthesizeVoice(stream: AudioStream, inputStream: Observable<string>, voice: string) {
    const synthesisResult$ = streamSynthesizeVoice(inputStream, voice).pipe(
        accumulateAudioStream(stream)
    );
    const partialResult$ = synthesisResult$.pipe(
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
    return partialResult$;
}

const pluginConfig = {
    voice: {
        name: "voice",
        description: "What voice to use",
        type: "enum",
        default: "en_US-norman-medium.onnx",
        values: {}
    }
} satisfies MippyPluginConfigDefinition

export type MippyVoicePlugin = MippyPlugin & {
    setVoice: (voice: string | null) => void,
    relayMessage$: Observable<string>
}

type Options = {
    voices: Record<string, string>
}

export function mippyVoicePlugin(fastify: FastifyInstance, socketHost: string, options: Options): MippyPluginDefinition {
    const audioRepository = new AudioRepository();
    pluginConfig.voice.values = options.voices;

    return {
        name: "Voice",
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>): Promise<MippyVoicePlugin> {
            const manualMessage$ = mippy.manualMessage$.pipe(
                map(message => of({
                    text: message.text,
                    finished: true,
                }))
            )

            const voice$ = new BehaviorSubject<string | null>(null);
            const selectedVoice$ = voice$.pipe(
                switchMap(voice => voice ? of(voice) : config.observe("voice"))
            )

            const message$ = merge(mippy.brain.receivePartials(), manualMessage$);

            const relayMessage$ = new Subject<{ duration: number, text: string }>();

            const streamEvent$ = message$.pipe(
                withLatestFrom(selectedVoice$),
                concatMapPriority(
                    ([partial, voice]: [Observable<MippyPartialResult>, string]) => {
                        const stream = audioRepository.create();
                        let startTime: number = Date.now();
                        const event$ = synthesizeVoice(stream, partial.pipe(map(p => p.text)), voice).pipe(
                            tapFirst(() => startTime = Date.now()),
                            timeout({
                                each: 60000,
                                with: () => {
                                    log.error("Timeout generating audio");
                                    return EMPTY;
                                }
                            })
                        );
                        // For completion we accumulate all of the partial messages together to get the full duration/text
                        const completed$ = event$.pipe(
                            accumulatePartialMessage(),
                            switchMap(m => {
                                // If the duration is greater than 0 it means we generated some audio and so we should
                                // pass that on to the relay and wait until it's probably finished playing on the client
                                if (m.duration > 0) {
                                    // Wait for however long is left from the start time to the end of the audio
                                    const timer$ = timer(m.duration * 1000 - (Date.now() - startTime)).pipe(
                                        switchMap(() => {
                                            // Send the message to the relay (to post on twitch) then wait a few more seconds
                                            // for some breathing room
                                            relayMessage$.next(m);
                                            return timer(3 * 1000);
                                        }),
                                        ignoreElements(),
                                    );
                                    const final$ = of({ id: stream.id, finished: true });
                                    return merge(timer$, final$);
                                }
                                return EMPTY;
                            }),
                        )
                        return [merge(event$, completed$), 0] as const;
                    }
                ),
                share()
            );

            fastify.register(async (fastify: FastifyInstance) => {
                fastify.addHook('onRequest', ejsLayout("stream-modules/stream-module", async (req, res) => ({
                    style: await getManifestPath("main.css"),
                    scripts: await getManifestPath("main.js"),
                    socketUrl: `${socketHost}/mippy/plugins/voice/websocket`,
                })));

                fastify.get(`/listen`, async (req, res) => {
                    return res.viewAsync(`stream-modules/mippy`, {})
                })

                fastify.register(socket([{
                    type: "mippySpeech",
                    data: streamEvent$
                }]));

                fastify.register(initTtsRouter(audioRepository), { prefix: "/audio" });
            }, { prefix: "/mippy/plugins/voice" })

            return {
                relayMessage$: relayMessage$.pipe(
                    concatMap(m => timer(m.duration * 1000).pipe(
                        map(() => m.text)
                    ))
                ),
                setVoice(voice) {

                },
            }
        },
    }
}