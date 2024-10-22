import { fromEvent, map, scan, single } from "rxjs";
import { fromDomEvent } from "./event";

export function observeMousePosition(element: HTMLElement | undefined) {
    const rootElement = element ?? document.documentElement;
    return fromDomEvent(rootElement, "mousemove").pipe(
        map(e => ({
            x: e.pageX - rootElement.offsetLeft,
            y: e.pageY - rootElement.offsetTop,
        }))
    )
}

export function observeMousePositionOffset(element?: HTMLElement) {
    return fromDomEvent(element ?? document.documentElement, "mousemove").pipe(
        map(e => ({
            x: e.offsetX,
            y: e.offsetY,
        }))
    )
}

export function observeMouseMove(element: HTMLElement) {
    return fromEvent<MouseEvent>(element, "mousemove").pipe(
        map(e => ({ x: e.movementX, y: e.movementY }))
    );
}

export function observeMouseMovedThreshold(element: HTMLElement, threshold = 5) {
    return observeMouseMove(element).pipe(
        scan((a, c) => a + Math.sqrt(c.x * c.x + c.y * c.y), 0),
        single(moved => moved > threshold),
    )
}