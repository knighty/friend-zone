import { debounceTime, Subject, throttleTime } from "rxjs";
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
    questions$ = new Subject<{ user: string, text: string }>();

    constructor(mippy: Mippy) {
        this.mippy = mippy;

        if (mippy) {
            this.questions$.pipe(
                debounceTime(5000),
                throttleTime(15000),
            ).subscribe(question => this.mippy.ask("question", { question: question.text, user: question.user }, { name: question.user, source: "admin" }))
        }
    }

    handle(userId: string, subtitleId: number, type: "interim" | "final", text: string) {
        this.stream$.next({
            userId: userId,
            subtitleId: subtitleId,
            text: text
        })

        const regex = /(?:[\.\?]|^)(?:.{0,10})(?:mippy|mipi|mippie)[,!](.*)/i
        const match = text.match(regex);
        if (match) {
            const q = match[1];
            this.questions$.next({
                user: userId,
                text: q
            });
        }
    }
}