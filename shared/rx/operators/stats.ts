import { Observable, merge, scan, share } from "rxjs";

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