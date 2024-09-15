import { fromEvent } from "rxjs";
import { WebSocket } from "ws";
import { connectGenericClient } from "./generic-client";

export const connectClient = connectGenericClient(url => {
    const socket = new WebSocket(url);
    return {
        messages$: fromEvent<MessageEvent<any>>(socket, "message"),
        on(event, handler) {
            socket.addEventListener(event, handler);
            return {
                unsubscribe: () => {
                    socket.removeEventListener(event, handler);
                }
            }
        },
        send(message) {
            socket.send(message.toString())
        },
    }
});