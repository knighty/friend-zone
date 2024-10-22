import { filter, first, fromEvent, map, startWith } from "rxjs";

/**
 * Observe when an image is loaded
 * @param element 
 * @returns 
 */
export function observeImageLoaded(element: HTMLImageElement) {
    return fromEvent(element, "load").pipe(
        map(e => element.complete),
        startWith(element.complete),
        filter(v => v),
        first()
    );
}