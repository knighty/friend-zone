import { concatMap, distinctUntilChanged, EMPTY, filter, fromEvent, ignoreElements, interval, map, merge, scan, share, startWith, switchMap, takeUntil, tap } from 'rxjs';
import { dom } from 'shared/dom';
import { CustomElement } from "shared/html/custom-element";
import { debounceState, drain, mapTruncateString, renderLoop$, sampleEvery, tapFirst, toggleClass } from 'shared/rx';
import { truncateString } from "shared/text-utils";
import { socket } from '../../socket';
import { AudioNodeCollection, LowPassNode, ReverbEffectNode } from './audio-effects';
import { FrequencyGraph } from './frequency-graph';

const template = `
<frequency-graph data-element="frequencyGraph"></frequency-graph>
<audio data-element="audio"></audio>
<input type="range" data-element="volume" min="0" max="100" />
<div data-element="avatar" class="avatar">
    <img class="image" data-element="mippy" src="${require("../../../images/mippy.png")}" />
</div>
<div class="subtitles" data-element="subtitles"></div>`

type SpeechDataFrame = {
    id: string,
    audio: {
        duration: number,
    },
    message: {
        text: string
    },
}

type SpeechEndFrame = {
    id: string,
    finished: true
}

type SpeechFrame = SpeechDataFrame | SpeechEndFrame;

function isSpeechDataFrame(frame: SpeechFrame): frame is SpeechDataFrame {
    return !("finished" in frame);
}

function isSpeechEndFrame(frame: SpeechFrame): frame is SpeechDataFrame {
    return "finished" in frame;
}

export class MippyModule extends CustomElement<{
    Data: {
        speech: SpeechFrame,
    },
    Elements: {
        subtitles: HTMLDivElement,
        audio: HTMLAudioElement,
        mippy: HTMLElement,
        avatar: HTMLElement,
        frequencyGraph: FrequencyGraph,
        volume: HTMLInputElement
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
        const audioOnly = document.location.hash == "#audio-only";
        const reverbEnabled = true;
        const dryWetRatio = 0.05;

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

        const audio = this.element("audio");
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(speechDestination);

        const volume = Number(localStorage.getItem("volume") ?? "50");
        this.element("volume").value = volume.toString();
        dom.elementEvent(this.element("volume"), "input").pipe(
            map(element => Number(element.value)),
            startWith(volume),
        ).subscribe(volume => {
            speechDestination.gain.value = volume / 100;
            localStorage.setItem("volume", volume.toString());
        })

        function updateSubtitles(text: string) {
            subtitleElement.textContent = text;
            subtitleElement.scrollTo(0, subtitleElement.scrollHeight);
        }

        /*
        (audioOnly ? speechEvent$.pipe(
            groupBy(frame => frame.id, {
                duration: group => group.pipe(filter(frame => isSpeechEndFrame(frame))),
            }),
            concatMap(frames => frames.pipe(
                filter(frame => isSpeechDataFrame(frame)),
                first(),
                switchMap(speech => playAudio(speech.id, speech.message.text.length / 15)),
            )),
            share()
        ) : */

        const playing$ = speechEvent$.pipe(
            drain(frame => frame.id, frame => isSpeechEndFrame(frame)),
            concatMap(frames$ => {
                const play$ = fromEvent(audio, "canplay").pipe(
                    tap(() => audio.play()),
                    ignoreElements()
                )

                const text$ = frames$.pipe(
                    filter(frame => isSpeechDataFrame(frame)),
                    tapFirst(frame => audio.src = `/mippy/plugins/voice/audio/${frame.id}`),
                    scan((a, c) => ({ text: a.text + c.message.text, duration: c.audio.duration }), { text: "", duration: 0 }),
                    sampleEvery(interval(100)),
                    mapTruncateString(
                        (event) => Math.floor(event.text.length * ((audio.currentTime + 1) / event.duration)),
                        (event, length) => truncateString(event.text, length)
                    ),
                );

                return merge(text$, play$).pipe(
                    takeUntil(fromEvent(audio, "ended").pipe(
                        filter(() => audio.duration != Infinity && !Number.isNaN(audio.duration) && audio.currentTime >= audio.duration - 0.1),
                    )),
                    tap(updateSubtitles),
                );
            }),
            debounceState(true, false, 1500),
            share(),
        );

        const analyzeFrames$ = renderLoop$.pipe(
            tap(() => {
                analyser.getByteTimeDomainData(dataArray);
                analyser.getFloatFrequencyData(frequencyArray);
            }));

        const analyzerData$ = playing$.pipe(
            switchMap(playing => playing ? analyzeFrames$ : EMPTY),
            share()
        )

        if (audioOnly) {
            playing$.subscribe();
        } else {
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
                tap(toggleClass(subtitleElement, "visible")),
                tap(toggleClass(avatar, "visible")),
            ).subscribe();
        }


    }
}