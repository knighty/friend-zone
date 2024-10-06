import { concatMap, distinctUntilChanged, endWith, ignoreElements, map, merge, Observable, scan, share, startWith, switchMap, tap, timer } from 'rxjs';
import { CustomElement } from "shared/html/custom-element";
import { renderLoop$ } from 'shared/rx/observables/render-loop';
import { switchMapComplete } from 'shared/rx/operators/switch-map-complete';
import { socket, SocketEvents } from '../../socket';

/*
<img src="${require("../../../images/lip-shapes/lisa-A.png")}" data-shape="A" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-B.png")}" data-shape="B" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-C.png")}" data-shape="C" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-D.png")}" data-shape="D" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-E.png")}" data-shape="E" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-F.png")}" data-shape="F" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-G.png")}" data-shape="G" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-H.png")}" data-shape="H" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-X.png")}" data-shape="X" style="display:block;" />*/

const template = `
<audio src="/tts/files/output-c6NlF24yOF.wav" controls data-element="audio"></audio>
<div data-element="avatar" class="avatar">
    <img class="image" data-element="mippy" src="${require("../../../images/mippy.png")}" />
</div>
<div class="subtitles" data-element="subtitles"></div>`

type AudioPlayEvent = {
    played: number,
    duration: number,
    currentTime: number,
    audio: HTMLAudioElement
}

abstract class AudioEffectNode<T extends Record<string, AudioNode>> {
    nodes: T;
    abstract connect(source: AudioNode, destination: AudioNode): void;
}

class ReverbEffectNode extends AudioEffectNode<{
    inputGain: GainNode,
    reverbGain: GainNode,
    reverb: ConvolverNode
}> {
    audioCtx: AudioContext;

    constructor(audioCtx: AudioContext) {
        super();
        this.audioCtx = audioCtx;
        this.nodes = {
            reverb: audioCtx.createConvolver(),
            inputGain: audioCtx.createGain(),
            reverbGain: audioCtx.createGain(),
        }
    }

    setDryWetRatio(ratio: number) {
        this.nodes.reverbGain.gain.value = ratio;
        this.nodes.inputGain.gain.value = 1 - ratio;
    }

    async setImpulse(url: string) {
        const response = await fetch(url);
        const arraybuffer = await response.arrayBuffer();
        this.nodes.reverb.buffer = await this.audioCtx.decodeAudioData(arraybuffer);
    }

    connect(source: AudioNode, destination: AudioNode): void {
        source.connect(this.nodes.inputGain);
        source.connect(this.nodes.reverb);
        this.nodes.reverb.connect(this.nodes.reverbGain);

        this.nodes.inputGain.connect(destination);
        this.nodes.reverbGain.connect(destination);
    }
}

class LowPassNode extends AudioEffectNode<{
    filter: BiquadFilterNode,
}> {
    audioCtx: AudioContext;

    constructor(audioCtx: AudioContext) {
        super();
        this.audioCtx = audioCtx;
        this.nodes = {
            filter: audioCtx.createBiquadFilter()
        }
    }

    connect(source: AudioNode, destination: AudioNode): void {
        this.nodes.filter.type = "lowpass";
        this.nodes.filter.frequency.value = 4000;
        this.nodes.filter.gain.value = 0.3;
        source.connect(this.nodes.filter);
        this.nodes.filter.connect(destination);
    }
}

class AudioNodeCollection {
    nodes: AudioEffectNode<any>[] = [];
    audioCtx: AudioContext;

    constructor(audioCtx: AudioContext) {
        this.audioCtx = audioCtx;
    }

    addNode(node: AudioEffectNode<any>) {
        this.nodes.push(node);
    }

    connect(source: AudioNode, destination: AudioNode) {
        let next: AudioNode = source;
        let previous: AudioNode = source;
        for (let node of this.nodes) {
            if (!node)
                continue;
            next = this.audioCtx.createGain();
            node.connect(previous, next);
            previous = next;
        }
        next.connect(destination);
    }
}

export class MippyModule extends CustomElement<{
    Data: {
        speech: SocketEvents["mippySpeech"],
    },
    Elements: {
        subtitles: HTMLDivElement,
        audio: HTMLAudioElement,
        mippy: HTMLElement,
        avatar: HTMLElement,
    }
}> {
    setup() {
        this.innerHTML = template;
        this.bindData("speech", socket.on("mippySpeech"));
    }

    connect() {
        const reverbEnabled = false;
        const dryWetRatio = 1;

        const subtitleElement = this.element("subtitles");
        const audio = this.element("audio");
        const mippy = this.element("mippy");
        const avatar = this.element("avatar");

        audio.volume = 0.5;

        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        const source = audioCtx.createMediaElementSource(audio);
        source.connect(analyser);

        const reverbNode = new ReverbEffectNode(audioCtx);
        reverbNode.setImpulse(require("../../../audio/matrix.wav"));
        reverbNode.setDryWetRatio(dryWetRatio);

        const lowPassNode = new LowPassNode(audioCtx);

        const nodeCollection = new AudioNodeCollection(audioCtx);
        if (reverbEnabled) {
            nodeCollection.addNode(reverbNode);
        }
        //nodeCollection.addNode(lowPassNode);
        nodeCollection.connect(source, audioCtx.destination);

        const mouthShapes: Record<string, HTMLImageElement> = {};
        for (let element of this.querySelectorAll("img")) {
            mouthShapes[element.dataset.shape] = element;
        }

        function playAudio(url: string) {
            return new Observable(subscriber => {
                audio.src = url;
                audio.play();
                subscriber.next();
                audio.addEventListener("ended", () => subscriber.complete());
            });
        }

        const speechEvent$ = this.registerHandler("speech").pipe(
            share()
        )

        const playing$ = speechEvent$.pipe(
            concatMap(speech => {
                const audio$ = playAudio(`/tts/files/${speech.audio.filename}`).pipe(
                    share()
                )
                const audioEvent$ = audio$.pipe(
                    switchMapComplete(audio => renderLoop$),
                    map(() => {
                        return {
                            played: audio.currentTime / audio.duration,
                            duration: audio.duration,
                            currentTime: audio.currentTime,
                            audio: audio
                        }
                    }),
                    share()
                )

                const subtitle$ = audioEvent$.pipe(
                    map(data => Math.floor(speech.message.text.length * data.played)),
                    endWith(speech.message.text.length),
                    distinctUntilChanged(),
                    tap(length => {
                        subtitleElement.textContent = speech.message.text.substring(0, length);
                        subtitleElement.scrollTo(0, subtitleElement.scrollHeight);
                    })
                );

                const amplitude$ = audioEvent$.pipe(
                    tap(() => analyser.getByteTimeDomainData(dataArray)),
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

                return merge(subtitle$, amplitude$).pipe(
                    ignoreElements(),
                    startWith(true),
                    endWith(false)
                );
            }),
        );

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

        /*
                const audio$ = this.registerHandler("speech").pipe(
                    concatMap(speech => {
                        audio.src = `/tts/files/${speech.audio.filename}`;
                        audio.play();
        
                        const audioEnded$ = fromEvent(audio, "ended");
                        const canPlay$ = fromEvent(audio, "canplay");
        
                        const audioEvent$ = renderLoop$.pipe(
                            map(() => {
                                return {
                                    played: audio.currentTime / audio.duration,
                                    duration: audio.duration,
                                    currentTime: audio.currentTime,
                                    audio: audio
                                }
                            }),
                        )
                        const lipShape$ = renderLoop$.pipe(
                            withLatestFrom(audioEvent$),
                            map(([frame, audioEvent]) => {
                                for (let event of speech.audio.phonemes) {
                                    if (event.time > audioEvent.currentTime) {
                                        return event.shape;
                                    }
                                }
                                return "X";
                            }),
                            distinctUntilChanged(),
                            startWith("X"),
                            map(shape => mouthShapes[shape]),
                            pairwise(),
                            tap(([previous, next]) => {
                                previous.style.display = "none";
                                next.style.display = "block";
                            })
                        )
                        const subtitle$ = audioEvent$.pipe(
                            map(data => Math.floor(speech.message.text.length * data.played)),
                            endWith(speech.message.text.length),
                            distinctUntilChanged(),
                            tap(length => subtitleElement.textContent = speech.message.text.substring(0, length))
                        );
                        return merge(subtitle$).pipe(
                            takeUntil(audioEnded$)
                        );
                    })
                );
        
                audio$.subscribe();*/
    }
}