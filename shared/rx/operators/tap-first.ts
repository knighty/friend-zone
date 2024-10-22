import { Observable } from "rxjs";

export function tapFirst<In>(fn: (value: In) => void) {
    return (source: Observable<In>) => {
        return new Observable<In>(subscriber => {
            let first = true;
            return source.subscribe({
                next(value) {
                    if (first) {
                        fn(value);
                        first = false;
                    }
                    subscriber.next(value);
                },
                error(err) {
                    subscriber.error(err);
                },
                complete() {
                    subscriber.complete();
                },
            })
        });
    }
}