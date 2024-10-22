import { filter } from "rxjs";
import { fromDomEvent } from "./event";
import { KeyEvents } from "./events";

/**
 * Observe a keyboard press
 * @param code The button to test
 * @param event Which key event to watch for. keydown or keyup
 * @param repeating Whether to register repeating inputs or not
 * @returns 
 */
export function observeKey(code: string, event: keyof KeyEvents = "keydown", repeating: boolean = false) {
    return fromDomEvent(document, event).pipe(
        filter(e => e.code == code && (!e.repeat || e.repeat == repeating))
    );
}