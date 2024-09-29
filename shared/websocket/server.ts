import { BehaviorSubject, endWith, ignoreElements, Observable, shareReplay, Subject, takeUntil } from "rxjs";
import { WebSocket } from "ws";
import { logger } from "../logger";
import { GenericSocket, Socket, socket } from "./socket";

type Options = {
    pingFrequency?: number
}

const defaultOptions: Required<Options> = {
    pingFrequency: 30 * 1000
}

type EventProvider = {
    hasEvent: (event: string) => boolean
    observe: (event: string) => Observable<any>
}

export class ObservableEventProvider implements EventProvider {
    data: Record<string, Observable<any>>;

    constructor(data: Record<string, Observable<any>>) {
        this.data = data;
    }

    hasEvent(event: string) {
        return !!this.data[event];
    }

    observe(event: string) {
        return this.data[event];
    }
}

const log = logger("web-socket-server");

export function serverSocket<T extends Socket>(ws: WebSocket, eventProvider: EventProvider, opts?: Options) {
    const options: Required<Options> = {
        ...defaultOptions,
        ...opts
    };

    const disconnected$ = new Subject<void>();

    const clientConnection$ = new Observable<GenericSocket>(subscriber => {
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

    const s = socket<T>(client$, eventProvider);

    return {
        ...s,
        isConnected$,
        connection$: client$,
        disconnected$: client$.pipe(ignoreElements(), endWith(true)),
    }
}