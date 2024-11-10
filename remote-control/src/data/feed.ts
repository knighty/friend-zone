import { BehaviorSubject } from "rxjs";

type Feed = {
    url: string,
    aspectRatio: string,
    sourceAspectRatio: string,
}

export class FeedSettings {
    feed$ = new BehaviorSubject<Feed | null>(null);
    active$ = new BehaviorSubject(true);

    constructor() {

    }
}