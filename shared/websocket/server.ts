import { green } from "kolorist";
import { BehaviorSubject, endWith, ignoreElements, Observable, shareReplay, Subject, takeUntil } from "rxjs";
import { WebSocket } from "ws";
import { logger } from "../logger";
import { GenericSocket, socket } from "./socket";

type Options = {
    pingFrequency?: number
    url?: string
}

const defaultOptions: Options = {
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

export function serverSocket(ws: WebSocket, eventProvider: EventProvider, opts?: Options) {
    const options: Options = {
        ...defaultOptions,
        ...opts
    };

    const disconnected$ = new Subject<void>();
    const urlString = options.url ? green(options.url) : ``;

    const clientConnection$ = new Observable<GenericSocket>(subscriber => {
        log.info(`Socket bound - ${urlString}`);
        subscriber.next(ws);
        const errorHandler = (e: any) => {
            log.error("Socket error");
            subscriber.error(e);
        }
        const closeHandler = (e: any) => {
            log.info(`Socket closed - ${urlString}`);
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

    const s = socket(client$, eventProvider);

    return {
        ...s,
        isConnected$,
        connection$: client$,
        disconnected$: client$.pipe(ignoreElements(), endWith(true)),
    }
}