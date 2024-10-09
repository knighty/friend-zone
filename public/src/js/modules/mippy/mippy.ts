import { concatMap, distinctUntilChanged, endWith, fromEvent, ignoreElements, interval, map, merge, scan, share, startWith, switchMap, takeUntil, tap, timer } from 'rxjs';
import { CustomElement } from "shared/html/custom-element";
import { renderLoop$ } from 'shared/rx/observables/render-loop';
import { truncateString } from 'shared/utils';
import { socket } from '../../socket';
import { AudioNodeCollection, LowPassNode, ReverbEffectNode } from './audio-effects';
import { FrequencyGraph } from './frequency-graph';

const template = `
<frequency-graph data-element="frequencyGraph"></frequency-graph>
<audio controls data-element="audio"></audio>
<div data-element="avatar" class="avatar">
    <img class="image" data-element="mippy" src="${require("../../../images/mippy.png")}" />
</div>
<div class="subtitles" data-element="subtitles"></div>`

const sampleRate = 22050;

export class MippyModule extends CustomElement<{
    Data: {
        speech: {
            audio: number,
            message: {
                text: string
            },
        },
        audioNodes: AudioBufferSourceNode
    },
    Elements: {
        subtitles: HTMLDivElement,
        audio: HTMLAudioElement,
        mippy: HTMLElement,
        avatar: HTMLElement,
        frequencyGraph: FrequencyGraph
    }
}> {
    audioCtx = new AudioContext();

    setup() {
        this.innerHTML = template;

        this.bindData("speech", socket.on("mippySpeech").pipe(
            distinctUntilChanged()
        ));
    }

    connect() {
        const reverbEnabled = true;
        const dryWetRatio = 0.2;

        const subtitleElement = this.element("subtitles");
        const mippy = this.element("mippy");
        const avatar = this.element("avatar");

        const audioCtx = this.audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.4;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const frequencyArray = new Float32Array(analyser.frequencyBinCount);

        const speechDestination = audioCtx.createGain();
        speechDestination.connect(analyser);

        const reverbNode = new ReverbEffectNode(audioCtx);
        reverbNode.setImpulse(require("../../../audio/matrix.wav"));
        reverbNode.setDryWetRatio(dryWetRatio);

        const nodeCollection = new AudioNodeCollection(audioCtx);
        if (reverbEnabled) {
            nodeCollection.addNode(reverbNode);
        }
        const lowPassNode = new LowPassNode(audioCtx);
        //nodeCollection.addNode(lowPassNode);
        nodeCollection.connect(speechDestination, audioCtx.destination);

        const mouthShapes: Record<string, HTMLImageElement> = {};
        for (let element of this.querySelectorAll("img")) {
            mouthShapes[element.dataset.shape] = element;
        }

        const speechEvent$ = this.registerHandler("speech").pipe(
            share()
        )

        const analyzerData$ = renderLoop$.pipe(
            tap(() => {
                analyser.getByteTimeDomainData(dataArray);
                analyser.getFloatFrequencyData(frequencyArray);
            }),
            share()
        );

        const audio = this.element("audio");
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(speechDestination);

        const playAudio = (id: number, estimatedDuration: number) => {
            audio.src = `/tts/audio/${id}`;
            audio.play();

            return interval(100).pipe(
                map(frame => {
                    const currentTime = audio.currentTime;
                    const duration = (audio.duration != Infinity && !Number.isNaN(audio.duration)) ? audio.duration : estimatedDuration;
                    return {
                        played: currentTime / duration,
                        duration: duration,
                        currentTime: currentTime
                    }
                }),
                takeUntil(fromEvent(audio, "ended")),
            );
        }

        const playing$ = speechEvent$.pipe(
            concatMap(speech => {
                const audio$ = playAudio(speech.audio, speech.message.text.length / 15).pipe(
                    share()
                )

                subtitleElement.textContent = "";

                const subtitle$ = audio$.pipe(
                    map(data => Math.floor(speech.message.text.length * data.played)),
                    endWith(speech.message.text.length),
                    distinctUntilChanged(),
                    map(length => truncateString(speech.message.text, length)),
                    distinctUntilChanged(),
                    tap(text => {
                        subtitleElement.textContent = text;
                        subtitleElement.scrollTo(0, subtitleElement.scrollHeight);
                    })
                );

                return merge(subtitle$).pipe(
                    ignoreElements(),
                    startWith(true),
                    endWith(false)
                );
            }),
        );

        this.element("frequencyGraph").bindData("frequencies", analyzerData$.pipe(map(() => frequencyArray)));

        const amplitude$ = analyzerData$.pipe(
            map(() => {
                let max = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    max = Math.max(max, dataArray[i]);
                }
                return max;
            }),
            scan((state, value) => {
                const dt = 1 / 60;
                state.v *= 0.94;
                state.v += (value - state.y) * 4;
                state.y += state.v * dt;
                return state;
            }, { y: 0, v: 0 }),
            map(value => Math.floor(value.y)),
            distinctUntilChanged(),
            tap(value => {
                mippy.style.setProperty("--animation", ((value - 128) / 128).toString())
            })
        )

        amplitude$.subscribe();

        playing$.pipe(
            startWith(false),
            switchMap(playing => {
                const wait = playing ? timer(0) : timer(3000);
                return wait.pipe(map(() => playing));
            }),
            tap(value => {
                subtitleElement.classList.toggle("visible", value);
                avatar.classList.toggle("visible", value);
            })
        ).subscribe();
    }
}