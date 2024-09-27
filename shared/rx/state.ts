import { Observable, shareReplay, Subscription } from "rxjs";

export default function state<State>(state: State, updaters: Observable<(state: State) => State | undefined>[]) {
    return new Observable<State>(subscriber => {
        const subscriptions: Subscription[] = updaters.map(updater => updater.subscribe(fn => {
            const newState = fn(state);
            if (newState !== undefined)
                state = newState;
            subscriber.next(state);
        }));
        return () => {
            for (let sub of subscriptions) {
                sub.unsubscribe();
            }
        }
    }).pipe(
        shareReplay(1)
    )
}