import { concatMap, distinctUntilChanged, map, merge, Observable, pairwise, share, startWith, tap } from 'rxjs';
import { CustomElement } from "shared/html/custom-element";
import { renderLoop$ } from 'shared/rx/observables/render-loop';
import { switchMapComplete } from "shared/rx/operators/switch-map-complete";
import { socket, SocketEvents } from '../../socket';

const template = `<div data-element="subtitles"></div>
<img src="${require("../../../images/lip-shapes/lisa-A.png")}" data-shape="A" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-B.png")}" data-shape="B" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-C.png")}" data-shape="C" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-D.png")}" data-shape="D" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-E.png")}" data-shape="E" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-F.png")}" data-shape="F" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-G.png")}" data-shape="G" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-H.png")}" data-shape="H" style="display:none;" />
<img src="${require("../../../images/lip-shapes/lisa-X.png")}" data-shape="X" style="display:block;" />`

type AudioPlayEvent = {
    played: number,
    duration: number,
    currentTime: number,
    audio: HTMLAudioElement
}

function playAudio(url: string) {
    return new Observable<AudioPlayEvent>(subscriber => {
        try {
            const audio = new Audio();
            audio.src = url;
            audio.play();
            const listener = () => subscriber.next({
                played: audio.currentTime / audio.duration,
                duration: audio.duration,
                currentTime: audio.currentTime,
                audio: audio
            });
            audio.addEventListener("timeupdate", listener);
            audio.addEventListener("ended", () => {
                console.log("Audio finished");
                audio.removeEventListener("timeupdate", listener);
                subscriber.complete();
            });
        } catch (e) {
            subscriber.error(e);
        }
    });
}

function interpolated<In>(lerp: (a: In, b: In, t: number) => In, startValue: In, endValue: In) {
    return (source: Observable<In>) => {
        return new Observable<In>(subscriber => {
            let previous: In = startValue;
            let previousTime = 0;
            let next: In = null;
            let nextTime = 0;
            let newValue: In = null;
            let value: In = startValue;
            let duration = 0;
            let time = 0;
            const renderSub = renderLoop$.subscribe(frame => {
                if (newValue != null) {
                    previous = value;
                    previousTime = nextTime;
                    next = newValue;
                    nextTime = frame.timestamp;
                    duration = nextTime - previousTime;
                    time = 0;
                    newValue = null;
                }
                time += frame.dt;
                value = lerp(previous, next, Math.min(1, time));
                subscriber.next(value);
            });
            const sub = source.subscribe({
                next: value => {
                    newValue = value;
                },
                complete: () => {
                    subscriber.next(endValue);
                    subscriber.complete()
                },
                error: error => subscriber.error(error)
            });
            return () => {
                renderSub.unsubscribe();
                sub.unsubscribe();
            }
        })
    }
}

export class MippyModule extends CustomElement<{
    Data: {
        speech: SocketEvents["mippySpeech"],
    },
    Elements: {
        subtitles: HTMLDivElement
    }
}> {
    setup() {
        this.innerHTML = template;
        this.bindData("speech", socket.on("mippySpeech"));
    }

    connect() {
        const subtitleElement = this.element("subtitles");

        const mouthShapes: Record<string, HTMLImageElement> = {};
        for (let element of this.querySelectorAll("img")) {
            mouthShapes[element.dataset.shape] = element;
        }

        this.registerHandler("speech").pipe(
            concatMap(speech => {
                const audioEvent$ = playAudio(`/tts/files/${speech.audio.filename}`).pipe(
                    share()
                );
                const lipShape$ = audioEvent$.pipe(
                    map(data => data.audio),
                    distinctUntilChanged(),
                    switchMapComplete(audio => renderLoop$.pipe(
                        map(() => {
                            for (let event of speech.audio.phonemes) {
                                if (event.time > audio.currentTime) {
                                    return event.shape;
                                }
                            }
                            return "X";
                        })
                    )),
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
                    //interpolated((a, b, t) => a + (b - a) * t, 0, 1),
                    tap(data => {
                        subtitleElement.textContent = speech.message.text.substring(0, Math.floor(speech.message.text.length * data.played))
                    })
                );
                return merge(subtitle$, lipShape$);
            })
        ).subscribe();
    }
}