import { Observable } from "rxjs";

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