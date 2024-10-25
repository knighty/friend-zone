
import { Monitor, Window } from "node-screenshots";
import { concatMap, map, Observable, of, startWith, switchMap, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { connectClient } from "shared/websocket/client";
import { ObservableEventProvider } from "shared/websocket/event-provider";

const log = logger("remote-control");
export function initSocket(url: string, data: Record<string, Observable<any>>, window$: Observable<Window | Monitor>) {
    const socket = connectClient<{
        Events: {
            subtitles: { enabled: boolean },
            getScreen: {}
        }
    }>(url, new ObservableEventProvider(data));

    /*socket.connected$.pipe(
        switchMap(() => socket.send<{ message: string }>("user", { id, name, discordId, sortKey }, true)),
        tap(message => log.info(`Registered: ${message.message}`))
    ).subscribe();*/

    const subtitlesEnabled$ = socket.isConnected$.pipe(
        switchMap(connected => {
            if (connected) {
                return socket.on("subtitles").pipe(
                    map(e => e.enabled),
                    startWith(false)
                );
            }
            return of(false)
        })
    );

    socket.on("getScreen", true).pipe(
        withLatestFrom(window$),
        concatMap(async ([[num, callback], window]) => {
            let monitor = Monitor.fromPoint(100, 100);
            let image = await (window ? window.captureImage() : monitor.captureImage());
            log.info("Captured screen grab");
            let data = await image.toJpeg();
            log.info("Sending screen grab");

            callback({ data: data.toString("binary") })
        })
    ).subscribe()

    return {
        connection$: socket.connected$,
        isConnected$: socket.isConnected$,
        subtitlesEnabled$
    }
}