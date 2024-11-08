import { map, startWith, Subject } from "rxjs";

export class ObservableArray<T> {
    data: T[] = [];
    update$ = new Subject<void>();

    add(item: T) {
        this.data.push(item);
        this.update$.next();
    }

    remove(item: T) {
        const i = this.data.find(i => item === i);
        this.update$.next();
    }

    elements() {
        return this.update$.pipe(
            startWith(undefined),
            map(() => this.data)
        )
    }
}