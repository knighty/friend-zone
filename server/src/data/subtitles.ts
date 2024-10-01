import { debounceTime, Subject } from "rxjs";
import { Mippy } from "../mippy/mippy";

type SubtitlesUser = {
    userId: string,
    subtitleId: number;
    text: string;
}

type SubtitleStreamEvent = SubtitlesUser;

export default class Subtitles {
    stream$ = new Subject<SubtitleStreamEvent>();
    mippy: Mippy;
    questions$ = new Subject<string>();

    constructor(mippy: Mippy) {
        this.mippy = mippy;

        if (mippy) {
            this.questions$.pipe(
                debounceTime(5000),
            ).subscribe(question => this.mippy.ask("question", { question }))
        }
    }

    handle(userId: string, subtitleId: number, type: "interim" | "final", text: string) {
        this.stream$.next({
            userId: userId,
            subtitleId: subtitleId,
            text: text
        })

        if (text.startsWith("Mippy,")) {
            const q = text.slice("Mippy,".length);
            this.questions$.next(q);
        }
    }
}