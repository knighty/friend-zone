import { Observable, shareReplay } from "rxjs";

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
                        ...map.get(kv.key) as V,
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