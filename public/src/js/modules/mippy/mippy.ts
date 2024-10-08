import { concatMap, distinctUntilChanged, endWith, filter, ignoreElements, map, merge, scan, share, startWith, switchMap, tap, timer } from 'rxjs';
import { CustomElement } from "shared/html/custom-element";
import { renderLoop$ } from 'shared/rx/observables/render-loop';
import { truncateString } from 'shared/utils';
import { socket } from '../../socket';
import { AudioNodeCollection, LowPassNode, ReverbEffectNode } from './audio-effects';
import { AudioStreamSocket } from './audio-stream-socket';
import { SpeechNodes } from './speech-nodes';

const template = `
<canvas class="" width="128" height="100"></canvas>
<div data-element="avatar" class="avatar">
    <img class="image" data-element="mippy" src="${require("../../../images/mippy.png")}" />
</div>
<div class="subtitles" data-element="subtitles"></div>`

const sampleRate = 22050;

export class MippyModule extends CustomElement<{
    Data: {
        speech: {
            speechNodes: SpeechNodes;
            text: string
        },
        audioNodes: AudioBufferSourceNode
    },
    Elements: {
        subtitles: HTMLDivElement,
        audio: HTMLAudioElement,
        mippy: HTMLElement,
        avatar: HTMLElement,
    }
}> {
    audioCtx = new AudioContext();
    audioStreamSocket = new AudioStreamSocket();

    setup() {
        this.innerHTML = template;
        const audioCtx = this.audioCtx;

        this.bindData("speech", socket.on("mippySpeech").pipe(
            distinctUntilChanged(),
            concatMap(speech => {
                return this.audioStreamSocket.getStream(audioCtx, speech.audio, speech.message.text.length / 15).pipe(
                    map(speechNodes => ({
                        speechNodes,
                        text: speech.message.text
                    }))
                )
            })
        ));
    }

    connect() {
        const reverbEnabled = true;
        const dryWetRatio = 0.5;

        const subtitleElement = this.element("subtitles");
        const mippy = this.element("mippy");
        const avatar = this.element("avatar");

        const audioCtx = this.audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.6;
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

        const playing$ = speechEvent$.pipe(
            concatMap(speech => {
                const audio$ = speech.speechNodes.play(speechDestination).pipe(
                    share()
                )

                subtitleElement.textContent = "";

                const subtitle$ = audio$.pipe(
                    map(data => Math.floor(speech.text.length * data.played)),
                    endWith(speech.text.length),
                    distinctUntilChanged(),
                    map(length => truncateString(speech.text, length)),
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

        const canvas = this.querySelector<HTMLCanvasElement>("canvas");
        const canvasContext = canvas.getContext("2d");
        const grad = canvasContext.createLinearGradient(0, 0, 100, 0);
        grad.addColorStop(0, "#45f1f0");
        grad.addColorStop(1, "#c829f1");
        const frequencies$ = analyzerData$.pipe(
            scan(bins => {
                const numBins = bins.length;
                const fftSize = frequencyArray.length;
                const samplesPerBin = fftSize / numBins;
                //bins.forEach((value, index) => bins[index] = bins[index] * 0.8)
                bins.fill(0);
                frequencyArray.forEach((value, index) => {
                    const normalizedValue = Math.pow((value + 128) / 256, 0.5);
                    bins[Math.floor((index / fftSize) * numBins)] += normalizedValue / samplesPerBin;
                })
                return bins;
            }, new Float32Array(16)),
            filter(bins => bins.some(v => v != 0)),
            tap(bins => {
                canvasContext.clearRect(0, 0, canvas.width, canvas.height);
                canvasContext.fillStyle = grad;
                canvasContext.beginPath();
                for (let i = 0; i < bins.length; i++) {
                    canvasContext.roundRect(i / bins.length * canvas.width, 0 + (1 - bins[i]) * 100, canvas.width / bins.length - 1, bins[i] * 100, 4);
                }
                canvasContext.fill();
            })
        );

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

        merge(frequencies$, amplitude$).subscribe();

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