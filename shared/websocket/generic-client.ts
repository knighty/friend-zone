import { BehaviorSubject, filter, finalize, first, map, Observable, share, shareReplay, Subject, switchMap, takeUntil, tap } from "rxjs";
import { logger } from "../logger";
import { retryWithBackoff } from "../rx/utils";

type SocketMessage<D> = {
    type: string,
    data: D;
    id: number;
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

function subscriptionHandler() {
    type SubscribedEvents = Record<string, number>;
    const subscriptions: SubscribedEvents = {};
    const subscriptions$ = new BehaviorSubject<SubscribedEvents>(subscriptions);

    function subscribe(event: string) {
        if (!subscriptions[event]) {
            subscriptions[event] = 0;
            subscriptions$.next(subscriptions);
        }
        subscriptions[event]++;

        return {
            unsubscribe: () => {
                subscriptions[event]--;
                if (subscriptions[event] == 0) {
                    delete subscriptions[event];
                    subscriptions$.next(subscriptions);
                }
            }
        }
    }

    return {
        subscriptions$: subscriptions$.pipe(
            map(subscriptions => Object.keys(subscriptions))
        ),
        subscribe
    }
}

export function connectGenericClient(socketFactory: (url: string) => Socket) {
    return function (url: string, opts?: Options) {
        const options: Required<Options> = {
            retry: true,
            retryBase: 1.1,
            retryMax: 60 * 1000,
            ...opts
        };

        const log = logger("web-socket-client");

        const subscriptions = subscriptionHandler();

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
            shareReplay(1),
        )

        client$.pipe(
            switchMap(client => subscriptions.subscriptions$.pipe(
                tap(events => client.send(JSON.stringify({ type: "subscribe", data: events })))
            )),
            takeUntil(disconnect$)
        ).subscribe();

        client$.pipe(
            switchMap(client => sendMessages$.pipe(
                tap(message => client.send(JSON.stringify(message)))
            )),
            takeUntil(disconnect$)
        ).subscribe();

        const websocketMessages$ = client$.pipe(
            switchMap(client => client.messages$),
            map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
            takeUntil(disconnect$),
            share()
        );

        type AddCallback<T> = T & { _callback: (data: any) => void };
        function addCallback(message: SocketMessage<any>) {
            const data = message.data;
            data._callback = (data: any) => {
                sendMessages$.next({ type: message.type, data, id: -message.id });
            }
            return data;
        }

        function socketMessages<D>(type: string): Observable<AddCallback<D>> {
            return new Observable(subscriber => {
                const socketSubscription = subscriptions.subscribe(type);
                const sub = websocketMessages$.pipe(
                    filter(message => message.type == type),
                    map(message => addCallback(message) as AddCallback<D>),
                    finalize(() => socketSubscription.unsubscribe()),
                ).subscribe(m => {
                    subscriber.next(m);
                })
                return () => sub.unsubscribe();
            })
        }

        const sendMessages$ = new Subject<{ type: string, data: any, id: number }>();

        const connected$ = client$;

        let messageId = 0;
        function send(type: string, data: any) {
            const id = messageId++;
            sendMessages$.next({ type, data, id });
            return websocketMessages$.pipe(
                filter(message => message.id == -id),
                first(),
                map(message => message.data)
            );
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