import { FastifyInstance } from "fastify";
import { fromEvent, ignoreElements, interval, merge, Observable, takeUntil, tap } from "rxjs";
import { log } from "../lib/logger";

type WebsocketMessageStream = Observable<{
    type: string,
    data: object | string
}>

export const socket = (streams: WebsocketMessageStream[]) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/websocket', { websocket: true }, (socket, req) => {
        function send(type: string, data: object | string) {
            socket.send(JSON.stringify({
                type: type,
                data: data
            }));
        }

        log.info("Opening web socket", "websocket");

        const streams$ = merge(...streams).pipe(
            tap(o => {
                send(o.type, o.data);
            })
        )

        const ping$ = interval(30 * 1000).pipe(
            tap(i => socket.ping()),
        );

        merge(
            streams$,
            ping$
        ).pipe(
            ignoreElements(),
            takeUntil(fromEvent(socket, "close"))
        ).subscribe({
            complete: () => {
                log.info("Closing web socket", "websocket");
            }
        });
    })
}