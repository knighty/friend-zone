import { concat, connect, debounceTime, MonoTypeOperatorFunction, take } from "rxjs";

export function debounceAfterFirst<T>(time: number, num: number = 1): MonoTypeOperatorFunction<T> {
    return connect(value =>
        concat(
            value.pipe(take(num)),
            value.pipe(debounceTime(time))
        )
    )
}