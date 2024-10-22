import { Observable, filter, fromEvent, map } from "rxjs";
import { Events } from "./events";

type ScopedEventOptions<T> = {
    /**
     * @prop Whether the event should be captured during the top down DOM traversal pass
     */
    capture: boolean,
    /**
     * @prop Whether the event should stop propagating after it's caught
     */
    stopPropagation: boolean,
    /**
     * @prop Whether the default behaviour of the event should be cancelled when it's caught
     */
    preventDefault: boolean,
    /**
     * Callback to check whether the event should be captured or not
     * @param e The captured event
     * @returns 
     */
    filterEvents: (e: T) => boolean
}

function ScopedEventOptionsDefaults<T>({
    capture = false,
    stopPropagation = true,
    preventDefault = true,
}: Partial<ScopedEventOptions<T>> = {}) {
    return { capture, stopPropagation, preventDefault };
}

/**
 * Observe an event emitted from the scoped element's children
 * @param scopedElement The parent element to watch for events
 * @param event Event to watch for
 * @param selector CSS selector for child elements to watch
 * @param options
 */
export function observeScopedEvent<E extends HTMLElement, T extends keyof Events>(scopedElement: Node, event: T, selector: string, options?: Partial<ScopedEventOptions<Events[T]>>): Observable<readonly [Events[T], E]> {
    options = ScopedEventOptionsDefaults(options);
    return fromEvent<Events[T]>(scopedElement, event, { capture: options?.capture ?? false }).pipe(
        map(e => {
            if (options?.filterEvents && !options.filterEvents(e)) {
                return null;
            }
            let element: E = e.target as E;
            do {
                if (!element.matches)
                    return null;
                if (element.matches(selector)) {
                    if (options.stopPropagation)
                        e.stopPropagation();
                    if (options.preventDefault)
                        e.preventDefault();
                    return [e, element] as const;
                }
                element = element.parentNode as E;
            } while (element != scopedElement && element != null);
            return null;
        }),
        filter(e => e != null)
    );
}