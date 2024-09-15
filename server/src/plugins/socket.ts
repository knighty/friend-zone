import { FastifyInstance } from "fastify";
import { Observable, merge, takeUntil, tap } from "rxjs";
import { serverSocket } from "shared/websocket/server";

type WebsocketMessageStream = Observable<{
    type: string,
    data: any
}>

export const socket = (streams: WebsocketMessageStream[]) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/websocket', { websocket: true }, (ws, req) => {
        const socket = serverSocket(ws);

        const streams$ = merge(...streams).pipe(
            tap(o => socket.send(o.type, o.data))
        )

        streams$.pipe(
            takeUntil(socket.disconnected$)
        ).subscribe();
    })
}