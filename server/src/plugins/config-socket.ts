import { FastifyInstance } from "fastify";
import { serverSocket } from "shared/websocket/server";
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
        }>(ws);

        for (let type in receivers) {
            socket.receive(type).subscribe((data: any) => receivers[type](data));
        }
        events.forEach(stream => socket.addEvent(stream.type, stream.data));
    })
}