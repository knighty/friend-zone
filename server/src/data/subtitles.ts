import { filter, Subject, throttleTime } from "rxjs";
import { Mippy } from "../mippy/mippy";

type SubtitlesUser = {
    userId: string,
    subtitleId: number;
    text: string;
    final: boolean;
}

type SubtitleStreamEvent = SubtitlesUser;

export default class Subtitles {
    stream$ = new Subject<SubtitleStreamEvent>();
    mippy: Mippy;
    questions$ = new Subject<{ user: string, question: string }>();

    constructor(mippy: Mippy) {
        this.mippy = mippy;

        if (mippy) {
            this.questions$.pipe(
                throttleTime(5000),
            ).subscribe(
                question => this.mippy.ask("question", question, { name: question.user, source: "admin", allowTools: true })
            )
        }
    }

    observeFinalMessages() {
        return this.stream$.pipe(
            filter(message => message.final)
        );
    }

    handle(userId: string, subtitleId: number, type: "interim" | "final", text: string) {
        this.stream$.next({
            userId: userId,
            subtitleId: subtitleId,
            text: text,
            final: type == "final"
        })

        const regex = /(?:[\.\?]|^)(?:.{0,10})(?:mippy|mipi|mippie)[,!](.*)/i
        const match = text.match(regex);
        if (match && type == "final") {
            const q = match[1];
            this.questions$.next({
                user: userId,
                question: q
            });
        }
    }
}