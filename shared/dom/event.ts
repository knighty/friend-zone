import { fromEvent, map, OperatorFunction } from "rxjs";
import { Events } from "./events";

/**
 * Observe a DOM event
 * @param element Element to observe
 * @param event Event to observe
 */
export function fromDomEvent<E extends EventTarget, T extends keyof Events>(element: E, event: T) {
    return fromEvent<Events[T]>(element, event);
}

/**
 * Observe a DOM event
 * @param element Element to observe
 * @param event Event to observe
 */
export function fromElementEvent<E extends EventTarget>(element: E, event: keyof Events) {
    //, C extends new (...args: any[]) => E
    return fromEvent<Events[typeof event]>(element, event).pipe(map(e => e.target as E));
}

/**
 * Plucks the target out of an event
 */
export function pluckEventTarget<R extends HTMLElement>(): OperatorFunction<Event, R> {
    return map((e: Event) => e.target as R);
}