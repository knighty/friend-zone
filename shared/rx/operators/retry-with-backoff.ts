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