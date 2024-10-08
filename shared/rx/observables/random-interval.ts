import { Observable, of, repeat, scan, switchMap, timer } from "rxjs";

export function randomInterval(time: () => number): Observable<number>;
export function randomInterval(min: number, max: number): Observable<number>;
export function randomInterval(min: number | ((iteration: number) => number), max?: number): Observable<number> {
    const timefn = typeof min == "number" ? () => min + (max ?? 0 - min) * Math.random() : min;
    let i = 0;
    return of('').pipe(
        switchMap(
            () => timer(timefn(i++))
        ),
        repeat(),
        scan((a, c) => ++a, 0),
    )
}