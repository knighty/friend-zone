
import { BehaviorSubject, fromEvent, map, merge, Observable, retry, shareReplay, Subject, switchMap, tap, timer } from "rxjs";
import WebSocket from "ws";
import { logger } from "../../server/src/lib/logger";

const log = logger("remote-socket");
export function initSocket(url: string, userId: string, userName: string, discordId: string) {
    //let ws: WebSocket;

    const send$ = new Subject<string>();
    const isConnected$ = new BehaviorSubject<boolean>(false);

    let socket$ = new Observable<WebSocket>(subscriber => {
        log.info(`Socket connecting to "${url}"...`)
        isConnected$.next(false);
        const socket = new WebSocket(url);
        const error$ = fromEvent(socket, "error").pipe(
            tap(event => subscriber.error())
        );
        const open$ = fromEvent(socket, "open").pipe(
            tap(event => {
                log.info(`Socket connected to "${url}"`)
                subscriber.next(socket);
                isConnected$.next(true);
            })
        );
        const close$ = fromEvent(socket, "close").pipe(
            tap(event => {
                log.info(`Socket closed`);
                isConnected$.next(false);
                subscriber.error();
            })
        );
        const sub = merge(
            error$, open$, close$,
            send$.pipe(tap(message => socket.send(message)))
        ).subscribe();
        return () => sub.unsubscribe()
    }).pipe(
        retry({
            delay: (_error, retryIndex) => {
                const interval = 5000;
                const delay = Math.pow(2, retryIndex - 1) * interval;
                return timer(interval);
            }
        }),
        shareReplay(1),
    )

    const messages$ = socket$.pipe(
        switchMap(socket => fromEvent<MessageEvent>(socket, "message")),
        map(event => JSON.parse(event.data))
    );

    function send(type: string, data?: object | string) {
        send$.next(JSON.stringify({
            type,
            data
        }))
    };

    socket$.pipe(
        tap(socket => send("user", { id: userId, name: userName, discordId: discordId }))
    ).subscribe();

    function subtitles(id: number, type: "interim" | "final", text: string) {
        send("subtitles", {
            type, text, id
        });
    }

    function feed(action: string, data?: object | string) {
        send(`feed/${action}`, data);
    }

    socket$.subscribe();

    return {
        subtitles: subtitles,
        feed,
        isConnected$
    }

}