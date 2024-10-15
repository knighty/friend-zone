import { combineLatest, distinctUntilChanged, interval, map, scan, share, startWith, withLatestFrom } from "rxjs";
import { CustomElement } from "shared/html/custom-element";
import { debounceState, switchMapComplete } from "shared/rx";

export type SubtitleMessage = {
    id: number,
    text: string
}

type Sub = { id: number, text: string };

export class SubtitlesElement extends CustomElement<{
    Data: {
        subtitles: Sub
    },
    Elements: {}
}> {
    connect() {
        const subtitles$ = this.registerHandler("subtitles").pipe(share());

        const text$ = subtitles$.pipe(
            distinctUntilChanged((a, b) => a.id == b.id),
            switchMapComplete(subtitle => {
                const text$ = subtitles$.pipe(
                    map(subtitle => subtitle.text),
                    startWith(subtitle.text)
                );
                const pos$ = interval(30).pipe(
                    withLatestFrom(text$),
                    scan((state, [i, text]) => {
                        return Math.min(text.length, state + 1);
                    }, 0),
                    distinctUntilChanged()
                );
                return combineLatest([text$, pos$]).pipe(
                    map(([text, pos]) => text.substring(0, pos)),
                )
            })
        )

        text$.subscribe(text => {
            this.textContent = text;
            this.scrollTo(0, this.scrollHeight);
        });

        text$.pipe(
            debounceState(true, false, 3000),
        ).subscribe(show => this.classList.toggle("show", show));

        /*subtitles$.pipe(
            filter(e => e.text != ""),
            scan((state, subtitle) => {
                if (state.id == subtitle.id) {
                    state.updateText(subtitle.text);
                    return state;
                } else {
                    const subject$ = new Subject<string>();
                    let cursor = 0;
                    let text = "";
                    state.id = subtitle.id;
                    state.observable = subject$.pipe(
                        startWith(subtitle.text),
                        tap(message => text = message),
                        exhaustMap(() => {
                            return interval(30).pipe(
                                tap(() => cursor++),
                                takeWhile(c => cursor <= text.length),
                                endWith(1),
                                map(() => text.substring(0, cursor)),
                            )
                        })
                    );
                    state.updateText = (t: string) => subject$.next(t);
                    return state;
                }
            }, { id: -1, observable: null, updateText: null } as { id: number, observable: Observable<string>, updateText: (text: string) => void }),
            map(state => state.observable),
            distinctUntilChanged(),
            switchMap(observable => observable),
            tap(message => {
                this.textContent = message;
                this.scrollTo(0, this.scrollHeight);
            }),
            tap(message => this.classList.add("show")),
            debounceTime(3000),
            tap(message => this.classList.remove("show")),
            takeUntil(this.disconnected$),
        ).subscribe();*/
    }
}