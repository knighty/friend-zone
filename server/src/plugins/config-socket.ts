import { FastifyInstance } from "fastify";
import { Observable } from "rxjs";
import { ObservableEventProvider, serverSocket } from "shared/websocket/server";
import { WebsocketEvent } from "./socket";

type Events<T extends Recievers> = {
    [K in keyof T]: (data: Parameters<T[K]>) => void
}

type Recievers = {
    [key: string]: any
}

export const configSocket = <R extends Recievers, T extends Events<R>>(events: WebsocketEvent[], receivers: R) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/config/websocket', { websocket: true }, (ws, req) => {
        let socket = serverSocket<{
            Events: T
        }>(ws, new ObservableEventProvider(
            events.reduce((a, stream) => {
                a[stream.type] = stream.data
                return a;
            }, {} as Record<string, Observable<any>>)
        ));

        for (let type in receivers) {
            socket.on(type).subscribe((data: any) => receivers[type](data));
        }
    })
}