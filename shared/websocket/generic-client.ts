import { BehaviorSubject, filter, map, Observable, scan, share, shareReplay, Subject, switchMap, takeUntil, tap } from "rxjs";
import { logger } from "../logger";
import { retryWithBackoff } from "../rxutils";

type SocketMessage<D> = {
    type: string,
    data: D;
}

type Options = {
    retry?: boolean,
    retryBase?: number,
    retryMax?: number,
}

type SocketEventSubscription = {
    unsubscribe: () => void
}

type Socket = {
    on: (event: "open" | "close" | "error", handler: any) => SocketEventSubscription;
    send: (message: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
    messages$: Observable<MessageEvent<any>>,
};

export function connectGenericClient(socketFactory: (url: string) => Socket) {
    return function (url: string, opts?: Options) {
        const options: Required<Options> = {
            retry: true,
            retryBase: 1.1,
            retryMax: 60 * 1000,
            ...opts
        };

        const log = logger("web-socket-client");

        const subscribeToEvent$ = new Subject<string>();
        const subscribedEvents$ = subscribeToEvent$.pipe(
            scan((a, c) => {
                a.push(c);
                return a;
            }, []),
            shareReplay(1)
        )
        const disconnect$ = new Subject<void>();

        const clientConnection$ = new Observable<Socket>(subscriber => {
            const ws = socketFactory(url);
            log.info(`Connecting to ${url}...`);
            const subscriptions = [
                ws.on("error", (e: any) => {
                    log.error("Socket error");
                    subscriber.error(e);
                }),
                ws.on("open", (e: any) => {
                    log.info("Socket open");
                    subscriber.next(ws);
                }),
                ws.on("close", (e: any) => {
                    log.info("Socket closed")
                    subscriber.error(e);
                })
            ]
            return () => {
                for (let sub of subscriptions) {
                    sub.unsubscribe();
                }
            }
        }).pipe(
            takeUntil(disconnect$),
            shareReplay(1)
        );

        const isConnected$ = new BehaviorSubject(false);
        const client$ = clientConnection$.pipe(
            options.retry ? retryWithBackoff(log, {
                subject$: isConnected$,
                base: options.retryBase,
                max: options.retryMax
            }) : undefined,
            shareReplay(1)
        )

        subscribedEvents$.pipe(
            switchMap(events => client$.pipe(
                tap(client => send("subscribe", events))
            )),
            takeUntil(disconnect$)
        ).subscribe();

        const websocketMessages$ = client$.pipe(
            switchMap(client => client.messages$),
            map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
            takeUntil(disconnect$),
            share()
        );

        function socketMessages<D>(type: string): Observable<D> {
            subscribeToEvent$.next(type);
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