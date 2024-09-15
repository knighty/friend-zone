import { FastifyInstance } from "fastify";
import { Subject } from "rxjs";
import { serverSocket } from "shared/websocket/server";

export const configSocket = (slideshowFrequency: Subject<number>, feedSize: Subject<number>, feedPosition: Subject<[number, number]>) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/config/websocket', { websocket: true }, (ws, req) => {
        let socket = serverSocket<{
            Events: {
                "config/slideshowFrequency": number,
                "config/feedPosition": [number, number],
                "config/feedSize": number,
            }
        }>(ws);

        socket.receive("config/slideshowFrequency").subscribe(frequency => {
            slideshowFrequency.next(frequency);
        });

        socket.receive("config/feedPosition").subscribe(position => {
            feedPosition.next(position);
        });

        socket.receive("config/feedSize").subscribe(size => {
            feedSize.next(size);
        });
    })
}