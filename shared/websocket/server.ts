import { BehaviorSubject, endWith, filter, fromEvent, ignoreElements, interval, map, merge, Observable, share, shareReplay, Subject, Subscription, switchMap, takeUntil, tap } from "rxjs";
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
    Events: Record<string, any>
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

    type Messages = T["Events"] & { "subscribe": string[] };
    function socketMessages<Key extends keyof Messages>(type: Key): Observable<Messages[Key]> {
        return websocketMessages$.pipe(
            filter(message => message.type == type),
            map<SocketMessage<Messages[Key]>, Messages[Key]>(message => message.data as Messages[Key])
        )
    }

    const sendMessages$ = new Subject<{ type: string, data: any, id: number }>();
    const events: Record<string, Observable<any>> = {};
    const eventSubscriptions$ = new Subject<string[]>();

    function eventSubs() {
        const eventSubscriptions: Record<string, Subscription> = {};
        return (source: Observable<string[]>) => {
            const sourceSubscription = source.subscribe(eventNames => {
                for (let name of eventNames) {
                    if (!eventSubscriptions[name]) {
                        if (events[name])
                            eventSubscriptions[name] = events[name].subscribe(value => send(name, value));
                        else
                            log.error(`Event "${name}" does not exist`);
                    }
                }
            })
            return new Observable(subscriber => {
                return () => {
                    for (let key in eventSubscriptions) {
                        eventSubscriptions[key].unsubscribe();
                    }
                    sourceSubscription.unsubscribe();
                }
            })
        }
    }

    let messageId = 0;
    merge(
        client$.pipe(
            switchMap(client => sendMessages$.pipe(
                tap(message => client.send(JSON.stringify(message)))
            ))
        ),
        interval(options.pingFrequency).pipe(
            tap(i => ws.ping()),
        ),
        eventSubscriptions$.pipe(
            eventSubs()
        ),
        socketMessages("subscribe").pipe(
            tap(events => eventSubscriptions$.next(events))
        )
    ).pipe(
        takeUntil(disconnected$)
    ).subscribe();

    function send(type: string, data: any) {
        sendMessages$.next({ type, data, id: messageId++ });
    }

    function disconnect() {
        disconnected$.next();
    }

    function addEvent<T>(type: string, observable: Observable<T>) {
        events[type] = observable;
    }

    return {
        receive: socketMessages,
        send: send,
        isConnected$,
        connection$: client$,
        disconnected$: client$.pipe(ignoreElements(), endWith(true)),
        disconnect,
        addEvent
    }
}