import { Observable } from "rxjs";

/**
 * Utility for doing a filter and map at the same time to
 * @param predicate Equality check
 * @param map Map input to output
 * @param startValue Optional start value
 * @returns 
 */
export function filterMap<In, Out>(predicate: (value: In) => boolean, map: (value: In) => Out, startValue?: Out) {
    return (source: Observable<In>) => {
        return new Observable<Out>(subscriber => {
            const sub = source.subscribe({
                next: value => {
                    if (predicate(value)) {
                        subscriber.next(map(value))
                    }
                },
                error: error => subscriber.error(error),
                complete: () => subscriber.complete()
            })
            if (startValue) {
                subscriber.next(startValue);
            }

            return () => sub.unsubscribe();
        })
    }
}