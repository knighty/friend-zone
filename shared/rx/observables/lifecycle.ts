import { Observable } from "rxjs";

export function observeLifecycle<T>(create: () => Observable<T>, unsubscribe: () => void) {
    return new Observable<T>(subscriber => {
        const obs = create();
        const s = obs.subscribe(args => subscriber.next(args));

        return () => {
            unsubscribe();
            s.unsubscribe();
        }
    })
}