import { Observable } from "rxjs";

export function throttleGroup<In>(projectKey: (value: In) => string, duration: number) {
    const timeouts: Record<string, boolean> = {};
    return (source: Observable<In>) => {
        return new Observable<In>(subscriber => {
            source.subscribe({
                next: value => {
                    const key = projectKey(value);
                    if (!(key in timeouts)) {
                        subscriber.next(value);
                    }
                    timeouts[key] = true;
                    setTimeout(() => {
                        delete timeouts[key];
                    }, duration);
                },
                error: (error) => subscriber.error(error),
                complete: () => subscriber.complete(),
            })
        })
    }
}