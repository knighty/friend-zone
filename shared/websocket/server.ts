import { BehaviorSubject, filter, fromEvent, ignoreElements, interval, map, merge, Observable, share, shareReplay, Subject, switchMap, takeUntil, tap } from "rxjs";
import { WebSocket } from "ws";
import { logger } from "../logger";

type SocketMessage<D> = {
    type: string,
    data: D;
}

type Options = {
    pingFrequency?: number
}

const defaultOptions: Required<Options> = {
    pingFrequency: 30 * 1000
}

type ServerSocket = {
    Events: any
}

export function serverSocket<T extends ServerSocket>(ws: WebSocket, opts?: Options) {
    const options: Required<Options> = {
        ...defaultOptions,
        ...opts
    };

    const disconnected$ = new Subject<void>();
    const log = logger("web-socket-server");

    const clientConnection$ = new Observable<WebSocket>(subscriber => {
        log.info("Socket bound");
        subscriber.next(ws);
        const errorHandler = (e: any) => {
            log.error("Socket error");
            subscriber.error(e);
        }
        const closeHandler = (e: any) => {
            log.info("Socket closed");
            disconnected$.next();
            subscriber.complete();
        }
        ws.addEventListener("error", errorHandler);
        ws.addEventListener("close", closeHandler);
        return () => {
            ws.removeEventListener("error", errorHandler);
            ws.removeEventListener("close", closeHandler);
        }
    }).pipe(
        takeUntil(disconnected$),
        shareReplay(1)
    );

    const isConnected$ = new BehaviorSubject(false);
    const client$ = clientConnection$;

    const websocketMessages$ = client$.pipe(
        switchMap(client => fromEvent<MessageEvent>(client, "message")),
        map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
        takeUntil(disconnected$),
        share()
    );

    function socketMessages<Key extends keyof T["Events"]>(type: Key): Observable<T["Events"][Key]> {
        return websocketMessages$.pipe(
            filter(message => message.type == type),
            map<SocketMessage<T["Events"][Key]>, T["Events"][Key]>(message => message.data as T["Events"][Key])
        )
    }

    const sendMessages$ = new Subject<{ type: string, data: any }>();

    merge(
        client$.pipe(
            switchMap(client => sendMessages$.pipe(
                tap(message => client.send(JSON.stringify(message)))
            ))
        ),
        interval(options.pingFrequency).pipe(
            tap(i => ws.ping()),
        )
    ).pipe(
        takeUntil(disconnected$)
    ).subscribe();

    function send(type: string, data: any) {
        sendMessages$.next({ type, data });
    }

    function disconnect() {
        disconnected$.next();
    }

    return {
        receive: socketMessages,
        send: send,
        isConnected$,
        disconnected$: client$.pipe(ignoreElements()),
        connected$: client$,
        disconnect
    }
}