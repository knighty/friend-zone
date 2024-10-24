import { defer, exhaustMap, finalize, from, Observable, ObservableInput, OperatorFunction, Subject, throttle } from "rxjs"

/**
 * Liek exhaust map but it also runs for the last item encountered while running
 * @param project 
 * @returns 
 */
export function exhaustMapWithTrailing<T, R>(
    project: (value: T, index: number) => ObservableInput<R>
): OperatorFunction<T, R> {
    return (source): Observable<R> => defer(() => {
        const release = new Subject<void>()

        return source.pipe(
            throttle(() => release, { leading: true, trailing: true }),
            exhaustMap((value, index) => from(project(value, index)).pipe(
                finalize(() => release.next())
            ) as Observable<R>)
        )
    })
}