import { FastifyInstance } from "fastify";
import { fromEvent, ignoreElements, interval, merge, Observable, takeUntil, tap } from "rxjs";
import Subtitles from "../data/subtitles";
import { log } from "../lib/logger";

type WebsocketMessageStream = Observable<{
    type: string,
    data: object | string
}>

export const remoteControlSocket = (subtitles: Subtitles) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/remote-control/websocket', { websocket: true }, (socket, req) => {
        let userId: string | undefined;
        function send(type: string, data: object | string) {
            socket.send(JSON.stringify({
                type: type,
                data: data
            }));
        }

        socket.on("message", (raw: any) => {
            const message = JSON.parse(raw);
            const data = message.data;
            switch (message.type) {
                case "user": {
                    userId = data.id
                } break;
                case "subtitles": {
                    subtitles.handle(userId, data.id, data.type, data.text);
                } break;
            }
            //console.log(message);
        })

        log.info("Opening web socket", "websocket");

        const ping$ = interval(30 * 1000).pipe(
            tap(i => socket.ping()),
        );

        merge(
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