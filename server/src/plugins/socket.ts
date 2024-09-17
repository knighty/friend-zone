import { FastifyInstance } from "fastify";
import { serverSocket } from "shared/websocket/server";

export type WebsocketEvent = {
    type: string,
    data: any
}

export const socket = (events: WebsocketEvent[], url: string = "/websocket") => async (fastify: FastifyInstance, options: {}) => {
    fastify.get(url, { websocket: true }, (ws, req) => {
        const socket = serverSocket(ws);
        events.forEach(stream => socket.addEvent(stream.type, stream.data));
    })
}