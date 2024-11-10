import { from, Observable, ObservableInput, OperatorFunction, Subscription } from "rxjs";

type QueueItem<O> = {
    observable: ObservableInput<O>,
    priority: number,
    id: number
}

/**
 * Like concat map but the projector should return a tuple of the observable and priority
 * Unlike concat map, this eagerly creates the observables rather than buffering inputs 
 * and then creating the observables
 * @param project 
 * @returns 
 */
export function concatMapPriority<T, R>(
    project: (value: T, index: number) => readonly [ObservableInput<R>, number]
): OperatorFunction<T, R> {
    const queue: QueueItem<R>[] = [];
    let innerSub: Subscription | null = null;
    let i = 0;
    function getNext() {
        queue.sort((a, b) => {
            if (a.priority == b.priority) {
                return b.id - a.id;
            }
            return b.priority - a.priority;
        });
        const last = queue.pop();
        if (last == undefined)
            return null;
        return last.observable;
    }

    return (source): Observable<R> => new Observable(subscriber => {
        let outerFinished = false;

        function checkFinished() {
            if (outerFinished && innerSub == null) {
                subscriber.complete();
            }
        }

        function subToInner(observable: ObservableInput<R>) {
            innerSub = from(observable).subscribe({
                complete() {
                    const next = getNext();
                    innerSub = null;
                    if (next) {
                        subToInner(next)
                    }
                    checkFinished();
                },
                error(err) {
                    subscriber.error(err);
                },
                next(value) {
                    subscriber.next(value);
                },
            })
        }

        return source.subscribe({
            next(value) {
                const [obs, priority] = project(value, i++);
                if (innerSub == null) {
                    subToInner(obs);
                } else {
                    queue.push({
                        observable: obs,
                        priority: priority,
                        id: i++,
                    })
                }
            },
            complete() {
                outerFinished = true;
                checkFinished();
            },
            error(err) {
                subscriber.error(err);
            },
        })
    })
}