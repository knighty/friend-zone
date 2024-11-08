import { Observable, repeat, Subject } from "rxjs";

export function refreshable<T>(obs: Observable<T>): [Observable<T>, () => void] {
    const refresh$ = new Subject<void>();
    return [
        obs.pipe(
            repeat({ delay: () => refresh$ }),
        ) as Observable<T>,
        () => refresh$.next()
    ] as const;
}