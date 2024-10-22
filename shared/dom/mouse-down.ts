import { filter, merge } from "rxjs";
import { fromDomEvent } from "./event";

export function observeMouseDown(element: HTMLElement, leftClick: boolean = true) {
    return merge(
        fromDomEvent(element, "mousedown").pipe(filter(e => (leftClick == false || e.button == 0))),
        fromDomEvent(element, "touchstart")
    );
}