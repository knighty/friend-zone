import { Observable, retry, Subject, tap, timer } from "rxjs";
import { Logger } from "../../logger";

type RetryOptions = {
    base: number,
    max: number,
    subject$?: Subject<boolean>,
}

/**
 * Retry when an error occurs with exponential backoff when failure occur
 * @param log 
 * @param options 
 * @returns 
 */
export function retryWithBackoff<T>(log: Logger, options: Partial<RetryOptions>) {
    const config: RetryOptions = {
        base: 1.5,
        max: 60000,
        ...options,
    }
    return (source: Observable<T>) => source.pipe(
        retry({
            delay: (_error, retryIndex) => {
                const interval = 1000;
                const delay = Math.pow(config.base, retryIndex - 1) * interval;
                if (delay > config.max)
                    throw new Error("Gave up retrying connection");
                log.info(`Retrying socket connection after ${Math.floor(delay / 1000)}s...`);
                if (config.subject$)
                    config.subject$.next(false);
                retryIndex++;
                return timer(delay);
            },
            resetOnSuccess: true
        }),
        tap(() => {
            if (config.subject$)
                config.subject$.next(true);
        })
    )
}