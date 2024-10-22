import { merge } from "rxjs";
import { fromDomEvent } from "./event";

export function observeMouseUp(element: HTMLElement) {
    return merge(
        fromDomEvent(element, "mouseup"),
        //fromEvent(element, "touchend")
    );
}