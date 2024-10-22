import { Observable, fromEvent, map, startWith } from "rxjs";
import { InputEvents } from "./events";

type ValueElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Observe an input element's value as it changes
 */
export function observeInput<T extends keyof InputEvents>(element: ValueElement | null, event: T = ("input" as T)): Observable<string> {
    if (element == null)
        throw Error("Element does not exist");
    return fromEvent<T>(element, event).pipe(map(e => element.value));
}

/**
 * Observe an input element's value
 */
export function observeInputField<T extends keyof InputEvents>(element: ValueElement | null, event: T = ("input" as T)): Observable<string> {
    return observeInput(element, event).pipe(startWith(element?.value ?? ""));
}