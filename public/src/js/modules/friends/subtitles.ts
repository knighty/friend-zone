import { debounceTime, distinctUntilChanged, endWith, exhaustMap, filter, interval, map, Observable, scan, startWith, Subject, switchMap, takeUntil, takeWhile, tap } from "rxjs";

export type SubtitleMessage = {
    id: number,
    text: string
}

export class SubtitlesElement extends HTMLElement {
    subtitles$ = new Subject<SubtitleMessage>();
    disconnected$ = new Subject<void>();
    isConnected = false;

    updateSubtitles(message: SubtitleMessage) {
        this.subtitles$.next(message);
    }

    disconnectedCallback() {
        this.isConnected = false;
        this.disconnected$.next();
    }

    connectedCallback() {
        if (!this.isConnected) {
            this.subtitles$.pipe(
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
            ).subscribe();
            this.isConnected = true;
        }
    }
}