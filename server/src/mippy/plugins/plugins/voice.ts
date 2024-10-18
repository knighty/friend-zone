import { FastifyInstance } from "fastify";
import { BehaviorSubject, EMPTY, Observable, concatMap, ignoreElements, map, merge, of, reduce, share, switchMap, tap, timeout, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { ObservableMap } from "shared/rx";
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

function synthesizeVoice(audioRepository: AudioRepository, inputStream: Observable<string>, voice: string) {
    const stream = audioRepository.create();
    return streamSynthesizeVoice(inputStream, voice).pipe(
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
        ([partial, voice]: [Observable<MippyPartialResult>, string]) => {
            const event$ = synthesizeVoice(tts, partial.pipe(map(p => p.text)), voice);
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

const pluginConfig = {
    voice: {
        name: "voice",
        description: "What voice to use",
        type: "enum",
        default: "en_US-norman-medium.onnx",
        values: {
            "en_US-norman-medium.onnx": "Norman",
            "en_US-ryan-high.onnx": "Ryan",
            "en_US-hfc_female-medium.onnx": "Female",
            "en_US-glados.onnx": "Glados",
            "vasco.onnx": "Vasco",
        }
    }
} satisfies MippyPluginConfigDefinition

export type MippyVoicePlugin = MippyPlugin & {
    setVoice: (voice: string | null) => void
}

export function mippyVoicePlugin(fastify: FastifyInstance, socketHost: string): MippyPluginDefinition {
    const audioRepository = new AudioRepository();

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

            const streamEvent$ = message$.pipe(
                withLatestFrom(selectedVoice$),
                concatMessages(audioRepository, mippy.messageHistory$),
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
                setVoice(voice) {

                },
            }
        },
    }
}