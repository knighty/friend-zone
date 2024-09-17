import { map, startWith, Subject } from "rxjs";
import { log } from "../lib/logger";

export default class Webcam {
    left: number = 0;
    top: number = 0;
    update$ = new Subject<Webcam>();

    setPosition(left: number, top: number) {
        log.info(`Set webcam position to ${left} / ${top}`);
        this.left = left;
        this.top = top;
        this.update$.next(this);
    }

    observePosition() {
        return this.update$.pipe(
            startWith(this),
            map(webcam => ({
                position: [webcam.left, webcam.top]
            }))
        )
    }
}