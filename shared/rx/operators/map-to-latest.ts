import { map, Observable, pipe, withLatestFrom } from "rxjs";

export function mapToLatest<T>(obs: Observable<T>) {
    return pipe(
        withLatestFrom(obs),
        map(([i, o]) => o)
    )
}