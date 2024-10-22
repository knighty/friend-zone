import { Observable } from "rxjs";

/**
 * Outputs the value of rising when values are coming in and then the value
 * of falling when they stop for a period of time set by duration
 * @param rising Value to output when values are coming in
 * @param falling Value to output when the duration expires
 * @param duration Time to wait until outputting falling in milliseconds
 * @returns 
 */
export function debounceState<In, T>(rising: T, falling: T, duration: number) {
    return (source: Observable<In>) => {
        let timeout: NodeJS.Timeout | undefined = undefined;
        return new Observable<T>(subscriber => {
            let value: T | undefined = undefined;
            let isComplete = false;
            const send = (v: T) => {
                if (v != value) {
                    subscriber.next(v);
                }
                if (isComplete) {
                    subscriber.complete();
                }
                value = v;
            }
            return source.subscribe({
                next(value) {
                    if (timeout == undefined) {
                        send(rising);
                    }
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        send(falling);
                        timeout = undefined;
                    }, duration);
                },
                complete: () => {
                    isComplete = true;
                    if (timeout == undefined) {
                        subscriber.complete();
                        return;
                    }
                },
                error: (err) => {
                    clearTimeout(timeout);
                    timeout = undefined;
                    subscriber.error(err)
                },
            })
        });
    }
}