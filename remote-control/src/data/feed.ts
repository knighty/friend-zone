import { BehaviorSubject } from "rxjs";

type Feed = {
    url: string,
    aspectRatio: string,
    sourceAspectRatio: string,
}

export class FeedSettings {
    feed$ = new BehaviorSubject<Feed | null>({
        aspectRatio: "16/9",
        sourceAspectRatio: "16/9",
        url: null
    });
    active$ = new BehaviorSubject(false);

    constructor() {

    }
}