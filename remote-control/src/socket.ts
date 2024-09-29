
import { map, Observable, of, startWith, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { connectClient } from "shared/websocket/client";
import { ObservableEventProvider } from "shared/websocket/event-provider";

const log = logger("remote-control");
export function initSocket(url: string, data: Record<string, Observable<any>>) {
    const socket = connectClient<{
        Events: {
            subtitles: { enabled: boolean }
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

    return {
        connection$: socket.connected$,
        isConnected$: socket.isConnected$,
        subtitlesEnabled$
    }
}