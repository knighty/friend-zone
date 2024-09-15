
import { tap } from "rxjs";
import { connectClient } from "shared/websocket/client";

export function initSocket(url: string, userId: string, userName: string, discordId: string) {
    const socket = connectClient(url);

    socket.connected$.pipe(
        tap(() => socket.send("user", { id: userId, name: userName, discordId: discordId }))
    ).subscribe();

    function subtitles(id: number, type: "interim" | "final", text: string) {
        socket.send("subtitles", {
            type, text, id
        });
    }

    function feed(action: string, data?: object | string) {
        socket.send(`feed/${action}`, data);
    }

    return {
        subtitles: subtitles,
        feed,
        isConnected$: socket.isConnected$
    }
}