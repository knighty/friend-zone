import { connectGenericClient } from "./generic-client";
import { GenericSocket } from "./socket";

interface WebSocketEventMap {
    "close": CloseEvent;
    "error": Event;
    "message": MessageEvent;
    "open": Event;
}

export const connectBrowserSocket = connectGenericClient(url => {
    const socket = new WebSocket(url);
    return {
        ping: (data?: any, mask?: boolean, cb?: (err: Error) => void) => { },
        send: (data: string, cb?: (err?: Error) => void) => socket.send(data),
        addListener: (event: string | symbol, listener: (...args: any[]) => void) => socket.addEventListener(event as keyof WebSocketEventMap, listener),
        removeListener: (event: string | symbol, listener: (...args: any[]) => void) => socket.removeEventListener(event as keyof WebSocketEventMap, listener),
    } as GenericSocket
});