import { merge, Observable, of, repeat, retry, scan, share, shareReplay, Subject, switchMap, tap, timer } from "rxjs";
import { Logger } from "../logger";

export type InferObservable<T> = T extends Observable<infer U> ? U : never;

type RetryOptions = {
    base: number,
    max: number,
    subject$?: Subject<boolean>,
}

export function retryWithBackoff<T>(log: Logger, options: Partial<RetryOptions>) {
    const config: RetryOptions = {
        base: 1.1,
        max: 60000,
        ...options,
    }
    let retryIndex = 1;
    return (source: Observable<T>) => source.pipe(
        retry({
            delay: (_error) => {
                const interval = 1000;
                const delay = Math.min(config.max, Math.pow(config.base, retryIndex - 1) * interval);
                log.info(`Retrying socket connection after ${Math.floor(delay / 1000)}s...`);
                if (config.subject$)
                    config.subject$.next(false);
                retryIndex++;
                return timer(delay);
            }
        }),
        tap(() => {
            if (config.subject$)
                config.subject$.next(true);
            retryIndex = 1;
        })
    )
}

export function updateableState<State>(state: State, updaters: Observable<(state: State) => State>[]) {
    return merge(...updaters).pipe(
        scan((state, update) => update(state), state),
        share()
    );
}

export function mutableState<State>(state: State, updaters: Observable<(state: State) => void>[]) {
    return merge(...updaters).pipe(
        scan((state, update) => (update(state), state), state),
        share()
    );
}

export function observableMap<K, V>(add: Observable<{ key: K, value: V }>, remove: Observable<K>, update: Observable<{ key: K, value: Partial<V> }>) {
    const o$ = new Observable<Map<K, V>>(subscriber => {
        const map = new Map<K, V>();
        const subscriptions = [
            add.subscribe(kv => {
                map.set(kv.key, kv.value);
                subscriber.next(map);
            }),
            remove.subscribe(key => {
                if (map.has(key)) {
                    map.delete(key);
                    subscriber.next(map);
                }
            }),
            update.subscribe(kv => {
                if (map.has(kv.key)) {
                    map.set(kv.key, {
                        ...map.get(kv.key),
                        ...kv.value
                    });
                    subscriber.next(map);
                }
            })
        ]
        return () => {
            for (let s of subscriptions) {
                s.unsubscribe();
            }
        }
    })
    return o$.pipe(
        shareReplay(1)
    );
}

export function randomInterval(time: () => number): Observable<number>;
export function randomInterval(min: number, max: number): Observable<number>;
export function randomInterval(min: number | ((iteration: number) => number), max?: number): Observable<number> {
    const timefn = typeof min == "number" ? () => min + (max - min) * Math.random() : min;
    let i = 0;
    return of('').pipe(
        switchMap(
            () => timer(timefn(i++))
        ),
        repeat(),
        scan((a, c) => ++a, 0),
    )
}