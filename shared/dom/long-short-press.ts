import { exhaustMap, first, map, partition, race, takeUntil, timer } from "rxjs";
import { observeMouseDown } from "./mouse-down";
import { observeMouseMovedThreshold } from "./mouse-move";
import { observeMouseUp } from "./mouse-up";

/**
 * Observe a short or long press on an element. Returns a tuple of the short and long press observables
 * @param element 
 * @param longPressSeconds How long the element must be held to trigger a long press
 */
export function observeShortLongPress(element: HTMLElement, longPressSeconds: number = 500) {
    const up$ = race(
        timer(longPressSeconds).pipe(map(() => true)),
        observeMouseUp(element).pipe(map(() => false)),
    ).pipe(
        takeUntil(observeMouseMovedThreshold(element)),
        first()
    );

    return partition(observeMouseDown(element).pipe(
        exhaustMap(() => up$),
    ), longPress => !longPress);
}