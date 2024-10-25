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
    }
}