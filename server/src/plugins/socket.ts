import { FastifyInstance } from "fastify";
import { Observable } from "rxjs";
import { ObservableEventProvider, serverSocket } from "shared/websocket/server";

export type WebsocketEvent = {
    type: string,
    data: any
}

export const socket = (events: WebsocketEvent[], url: string = "/websocket") => async (fastify: FastifyInstance, options: {}) => {
    fastify.get(url, { websocket: true }, (ws, req) => {
        const socket = serverSocket(ws, new ObservableEventProvider(
            events.reduce((a, stream) => {
                a[stream.type] = stream.data
                return a;
            }, {} as Record<string, Observable<any>>)
        ));
    })
}