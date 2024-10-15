import { finalize, fromEvent, interval, map, merge, Observable, share, Subject, Subscription, take, tap } from "rxjs";
import { logger } from "../logger";
import { filterMap } from "../rx";
import { switchMapComplete } from "../rx/operators/switch-map-complete";
import { EventProvider } from "./event-provider";
import { subscriptionHandler } from "./event-subscriptions";

type SocketMessage<D> = {
    type?: string,
    data: D;
    id: number;
}

export type Socket = {
    Events: Record<string, any>;
}

export type GenericSocket = {
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: string, cb?: (err?: Error) => void): void;
    addListener(event: string | symbol, listener: (...args: any[]) => void): GenericSocket;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): GenericSocket;
}

const log = logger("web-socket-server");
export function socket<T extends Socket>(client$: Observable<GenericSocket>, eventProvider?: EventProvider) {
    type Messages = T["Events"];
    type AddCallback<T> = readonly [T, (data: any) => void];

    const sendMessages$ = new Subject<SocketMessage<any>>();
    const websocketMessages$ = client$.pipe(
        switchMapComplete(client => fromEvent<MessageEvent>(client, "message")),
        map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
        share()
    );
    const subscriptions = subscriptionHandler();
    let messageId = 1;

    function on<Key extends keyof Messages, Callback extends boolean = false>(type: Key, callback?: Callback) {
        const cb = (id: number, data: any) => {
            sendMessages$.next({ data, id });
        };

        return new Observable(subscriber => {
            const socketSubscription = subscriptions.subscribe(String(type));
            return websocketMessages$.pipe(
                filterMap(
                    message => message.type == type,
                    callback ?
                        message => [message.data, (data: any) => cb(-message.id, data)] :
                        message => message.data,
                ),
                finalize(() => socketSubscription.unsubscribe()),
            ).subscribe(m => subscriber.next(m))
        }) as Callback extends true ? Observable<AddCallback<Messages[Key]>> : Observable<Messages[Key]>
    }

    function send(type: string, data: any): void;
    function send<Callback>(type: string, data: any, callback: true): Observable<Callback>;
    function send<Callback>(type: string, data: any, callback = false): Callback extends never ? undefined : Observable<Callback> {
        const id = messageId++;
        sendMessages$.next({ type, data, id });
        if (callback) {
            return websocketMessages$.pipe(
                filterMap(message => message.id == -id, message => message.data),
                take(1),
            ) as Callback extends never ? undefined : Observable<Callback>;
        }
        return undefined as Callback extends never ? undefined : Observable<Callback>;
    }

    function eventSubs(eventProvider?: EventProvider) {
        if (!eventProvider)
            return tap(() => log.error("An event was tried to be subscribed to but there is no event provider"));
        const eventSubscriptions: Record<string, Subscription> = {};
        return (source: Observable<string[]>) => {
            return new Observable(subscriber => {
                const sourceSubscription = source.subscribe({
                    next: eventNames => {
                        for (let name of eventNames) {
                            if (!eventSubscriptions[name] && name != "subscribe") {
                                if (eventProvider.hasEvent(name))
                                    eventSubscriptions[name] = eventProvider.observe(name).subscribe(value => send(name, value));
                                else
                                    log.error(`Event "${name}" does not exist`);
                            }
                        }
                    },
                    error: error => subscriber.error(error),
                    complete: () => subscriber.complete(),
                })

                return () => {
                    for (let key in eventSubscriptions) {
                        eventSubscriptions[key].unsubscribe();
                    }
                    sourceSubscription.unsubscribe();
                }
            })
        }
    }

    client$.pipe(
        switchMapComplete(client => {
            const ping$ = interval(30000).pipe(
                tap(i => client.ping()),
            );
            const messages$ = sendMessages$.pipe(
                tap(message => client.send(JSON.stringify(message)))
            )
            const events$ = on("subscribe").pipe(
                eventSubs(eventProvider)
            );
            const subscriptions$ = subscriptions.subscriptions$.pipe(
                tap(events => client.send(JSON.stringify({ type: "subscribe", data: events })))
            );

            return merge(ping$, messages$, events$, subscriptions$)
        })
    ).subscribe();

    return {
        on: on,
        send: send,
    }
}