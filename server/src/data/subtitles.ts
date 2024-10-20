import { filter, Subject } from "rxjs";
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
    }
}