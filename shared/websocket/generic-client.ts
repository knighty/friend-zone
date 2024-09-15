import { BehaviorSubject, filter, map, Observable, retry, share, shareReplay, Subject, switchMap, takeUntil, tap, timer } from "rxjs";
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

type SocketEventSubscription = {
    unsubscribe: () => void
}

type Socket = {
    on: (event: "open" | "close" | "error", handler: any) => SocketEventSubscription;
    messages$: Observable<MessageEvent<any>>,
    send: (message: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
};

export function connectGenericClient(socketFactory: (url: string) => Socket) {
    return function (url: string, opts?: Options) {
        const options: Required<Options> = {
            ...defaultOptions,
            ...opts
        };

        const disconnect$ = new Subject<void>();
        const log = logger("web-socket-client");

        const clientConnection$ = new Observable<Socket>(subscriber => {
            const ws = socketFactory(url);
            log.info("Connecting to socket...");
            const errorSubscription = ws.on("error", (e: any) => {
                log.error("Socket error");
                subscriber.error(e);
            });
            const openSubscription = ws.on("open", (e: any) => {
                log.info("Socket open");
                subscriber.next(ws);
            });
            const closeSubscription = ws.on("close", (e: any) => {
                log.info("Socket closed")
                subscriber.error(e);
            });
            return () => {
                errorSubscription.unsubscribe();
                openSubscription.unsubscribe();
                closeSubscription.unsubscribe();
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
                        return timer(delay);
                    }
                }) : undefined,
                tap(() => isConnected$.next(true)),
                shareReplay(1)
            )
            return [client$, isConnected$] as const;
        }

        const [client$, isConnected$] = connect();

        const websocketMessages$ = client$.pipe(
            switchMap(client => client.messages$),
            map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
            takeUntil(disconnect$),
            share()
        );

        function socketMessages<D>(type: string): Observable<D> {
            return websocketMessages$.pipe(
                filter(message => message.type == type),
                map<SocketMessage<D>, D>(message => message.data as D)
            )
        }

        const sendMessages$ = new Subject<{ type: string, data: any }>();

        const connected$ = client$;

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
            connected$,
            disconnect
        }
    }
}