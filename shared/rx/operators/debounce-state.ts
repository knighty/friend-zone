import { debounceTime, distinctUntilChanged, Observable, tap } from "rxjs";

export function debounceState<In, T>(rising: T, falling: T, duration: number) {
    return (source: Observable<In>) => {
        return new Observable<T>(subscriber => {
            return source.pipe(
                tap(() => subscriber.next(rising)),
                debounceTime(duration),
                tap(() => subscriber.next(falling)),
            ).subscribe({
                complete: () => subscriber.complete(),
                error: (err) => subscriber.error(err),
            })
        }).pipe(
            distinctUntilChanged()
        );
    }
}