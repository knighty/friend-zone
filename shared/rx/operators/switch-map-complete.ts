import { Observable, Subscription } from "rxjs";

export function switchMapComplete<In, T>(project: (value: In) => Observable<T>, debug = false) {
    return (source: Observable<In>) => {
        return new Observable<T>(subscriber => {
            let innerSub: Subscription | null = null;
            const outerSub = source.subscribe({
                next: (value: In) => {
                    const observable = project(value);
                    innerSub?.unsubscribe();
                    innerSub = observable.subscribe({
                        next(value) {
                            subscriber.next(value)
                        },
                        error(err) {
                            subscriber.error(err);
                        },
                        complete() {
                            innerSub = null;
                        },
                    });
                },
                error(error) { subscriber.error(error) },
                complete() {
                    subscriber.complete();
                }
            })

            return () => {
                outerSub.unsubscribe();
                innerSub?.unsubscribe();
            }
        })
    }
}