import { finalize, Observable } from "rxjs";

export function sampleEvery<In>(sample: Observable<any>) {
    return (source: Observable<In>) => {
        return new Observable<In>(subscriber => {
            let value: In | undefined = undefined;
            const sourceSubscription = source.subscribe({
                next: v => value = v,
                complete: () => { },
                error: (err) => subscriber.error(err),
            })
            return sample.pipe(
                finalize(() => sourceSubscription.unsubscribe())
            ).subscribe({
                next() {
                    if (value) {
                        subscriber.next(value);
                    }
                },
                complete: () => subscriber.complete(),
                error: (err) => subscriber.error(err),
            })
        })
    }
}