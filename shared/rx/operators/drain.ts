import { Observable, Subject, defer, finalize, from, merge, takeWhile } from "rxjs"

/**
 * Take an input stream and divide it into a series of sinks which can be drained by a consumer at any point
 * The operator maintains all input values in a sink until they are subscribed to by a consumer at which point
 * they are deleted
 * @param projectKey Provide a key for which sink the input data should drain in to
 * @param finished Return a bool for whether the data has finished or not
 * @param reducer An optional reducer to apply to sinks that are not in the process of draining to save memory
 * @returns 
 */
export function drain<In>(projectKey: (value: In) => string, finished: (value: In) => boolean, reducer?: (value: In) => In) {
    const sinks: Record<string, In[]> = {}
    const sinks$: Record<string, Subject<In>> = {}

    return (source: Observable<In>) => {
        return new Observable<Observable<In>>(subscriber => {
            return source.subscribe({
                error: err => subscriber.error(err),
                complete: () => subscriber.complete(),
                next: value => {
                    const key = projectKey(value);
                    if (sinks[key]) {
                        if (reducer) {
                            sinks[key] = [reducer(sinks[key][0])]
                        } else {
                            sinks[key].push(value);
                        }
                        sinks$[key].next(value);
                    } else {
                        sinks[key] = [value];
                        sinks$[key] = new Subject<In>();

                        subscriber.next(defer(() => {
                            return merge(from(sinks[key]), sinks$[key]).pipe(
                                takeWhile(v => !finished(v), true),
                                finalize(() => {
                                    delete sinks$[key];
                                    delete sinks[key];
                                })
                            )
                        }));
                    }
                }
            })
        })
    }
}