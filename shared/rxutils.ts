import { animationFrames, filter, map, Observable, pairwise, retry, share, skip, Subject, tap, timer } from "rxjs";
import { Logger } from "./logger";

export const renderLoop$ = animationFrames().pipe(
    skip(1),
    pairwise(),
    map(([a, b]) => {
        return { dt: (b.timestamp - a.timestamp) / 1000, timestamp: b.timestamp / 1000 };
    }),
    filter(frame => frame.dt < 0.1),
    share()
);

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