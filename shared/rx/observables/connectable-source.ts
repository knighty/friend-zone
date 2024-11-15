import { connectable, Observable } from "rxjs";

export function connectableSource<T>(observable$: Observable<T>) {
    const o$ = connectable(observable$);
    return [o$, o$.connect()] as const;
}