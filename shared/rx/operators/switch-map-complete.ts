import { Observable, Subscription } from "rxjs";

export function switchMapComplete<In, T>(project: (value: In) => Observable<T>, debug = false) {
    return (source: Observable<In>) => {
        return new Observable<T>(subscriber => {
            let innerSub: Subscription | null = null;
            const outerSub = source.subscribe({
                next: (value: In) => {
                    if (debug) console.log("1");
                    const observable = project(value);
                    innerSub?.unsubscribe();
                    innerSub = observable.subscribe({
                        next(value) {
                            subscriber.next(value)
                            if (debug) console.log("2");
                        },
                        error(err) {
                            subscriber.error(err);
                            if (debug) console.log("3");
                        },
                        complete() {
                            innerSub = null;
                            if (debug) console.log("4");
                        },
                    });
                },
                error(error) { subscriber.error(error) },
                complete() {
                    subscriber.complete();
                    if (debug) console.log("5");
                }
            })

            return () => {
                if (debug) console.log("6");
                outerSub.unsubscribe();
                innerSub?.unsubscribe();
            }
        })
    }
}