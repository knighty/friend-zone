import { BehaviorSubject, catchError, EMPTY, Observable, shareReplay, Subject, takeUntil, tap } from "rxjs";
import { logger } from "../logger";
import { retryWithBackoff } from "../rx/operators/retry-with-backoff";
import { EventProvider } from "./event-provider";
import { GenericSocket, Socket, socket } from "./socket";

type Options = {
    retry?: boolean,
    retryBase?: number,
    retryMax?: number,
}

export function connectGenericClient(socketFactory: (url: string) => GenericSocket) {
    return function <T extends Socket>(url: string, eventProvider?: EventProvider, opts?: Options) {
        const options: Required<Options> = {
            retry: true,
            retryBase: 1.5,
            retryMax: 60 * 1000,
            ...opts
        };

        const log = logger("web-socket-client");

        const disconnect$ = new Subject<void>();
        const isConnected$ = new BehaviorSubject(false);

        const clientConnection$ = new Observable<GenericSocket>(subscriber => {
            const ws = socketFactory(url);
            log.info(`Connecting to ${url}...`);
            function error(e: any) {
                log.error("Socket error");
                isConnected$.next(false);
                subscriber.error(e);
            };
            function open(e: any) {
                log.info("Socket open");
                isConnected$.next(true);
                subscriber.next(ws);
            }
            function close(e: any) {
                log.info("Socket closed")
                isConnected$.next(false);
                subscriber.error(e);
            }
            ws.addListener("error", error);
            ws.addListener("open", open);
            ws.addListener("close", close);
            return () => {
                ws.removeListener("error", error);
                ws.removeListener("open", open);
                ws.removeListener("close", close);
            }
        }).pipe(
            takeUntil(disconnect$),
            shareReplay(1)
        );

        const client$ = clientConnection$.pipe(
            options.retry ? retryWithBackoff(log, {
                base: options.retryBase,
                max: options.retryMax
            }) : tap(),
            catchError(e => {
                log.error(new Error("Could not connect to server", { cause: e }));
                return EMPTY;
            }),
            shareReplay(1),
        )

        const s = socket<T>(client$, eventProvider);

        function disconnect() {
            disconnect$.next();
        }

        return {
            ...s,
            isConnected$,
            connected$: client$,
            disconnect
        }
    }
}