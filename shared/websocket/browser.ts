import { BehaviorSubject, filter, fromEvent, map, Observable, retry, share, shareReplay, Subject, switchMap, takeUntil, tap, timer } from "rxjs";
import { logger } from "../logger";

type SocketMessage<D> = {
    type: string,
    data: D;
}

type Options = {
    retry?: boolean,
}

const defaultOptions: Required<Options> = {
    retry: true
}

export function connectSocket(url: string, opts?: Options) {
    const options: Required<Options> = {
        ...defaultOptions,
        ...opts
    };

    const disconnect$ = new Subject<void>();
    const log = logger("web-socket");

    const clientConnection$ = new Observable<WebSocket>(subscriber => {
        const ws = new WebSocket(url);
        log.info("Connecting to socket...");
        const errorHandler = (e: any) => {
            log.error("Socket error");
            subscriber.error(e);
        }
        const openHandler = (e: any) => {
            log.info("Socket open");
            subscriber.next(ws);
        }
        const closeHandler = (e: any) => {
            log.info("Socket closed")
            subscriber.error(e);
        }
        ws.addEventListener("error", errorHandler);
        ws.addEventListener("open", openHandler);
        ws.addEventListener("close", closeHandler);
        return () => {
            ws.removeEventListener("error", errorHandler);
            ws.removeEventListener("open", openHandler);
            ws.removeEventListener("close", closeHandler);
        }
    }).pipe(
        takeUntil(disconnect$),
        shareReplay(1)
    );

    function connect() {
        const isConnected$ = new BehaviorSubject(false);
        const client$ = clientConnection$.pipe(
            options.retry ? retry({
                delay: (_error, retryIndex) => {
                    const interval = 1000;
                    const delay = Math.min(60 * 1000, Math.pow(2, retryIndex - 1) * interval);
                    log.info(`Retrying socket connection after ${delay / 1000}s...`);
                    isConnected$.next(false);
                    return timer(interval);
                }
            }) : undefined,
            tap(() => isConnected$.next(true)),
            shareReplay(1)
        )
        return [client$, isConnected$] as const;
    }

    const [client$, isConnected$] = connect();

    const websocketMessages$ = client$.pipe(
        switchMap(client => fromEvent<MessageEvent>(client, "message")),
        map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
        share()
    );

    function socketMessages<D>(type: string): Observable<D> {
        return websocketMessages$.pipe(
            filter(message => message.type == type),
            map<SocketMessage<D>, D>(message => message.data as D)
        )
    }

    const sendMessages$ = new Subject<{ type: string, data: any }>();

    client$.pipe(
        switchMap(client => sendMessages$.pipe(
            tap(message => client.send(JSON.stringify(message)))
        )),
        takeUntil(disconnect$)
    ).subscribe();

    function send(type: string, data: any) {
        sendMessages$.next({ type, data });
    }

    function disconnect() {
        disconnect$.next();
    }

    return {
        receive: socketMessages,
        send: send,
        isConnected$,
        disconnect
    }
}