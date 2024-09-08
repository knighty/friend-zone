import { FastifyInstance } from "fastify";
import { fromEvent, ignoreElements, interval, merge, startWith, takeUntil, tap } from "rxjs";
import Webcam from "../data/webcam";
import { WordOfTheHour } from "../data/word-of-the-hour";
import { log } from "../lib/logger";

export const socket = (wordOfTheHour: WordOfTheHour, webcam: Webcam) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/websocket', { websocket: true }, (socket, req) => {
        function send(type: string, data: object | string) {
            socket.send(JSON.stringify({
                type: type,
                data: data
            }));
        }

        log.info("Opening web socket", "websocket");

        const woth$ = wordOfTheHour.update$.pipe(
            startWith(null),
            tap(() => {
                send("woth", {
                    word: wordOfTheHour.word,
                    people: wordOfTheHour.people
                });
            }),
        );

        const webcam$ = webcam.update$.pipe(
            startWith(webcam),
            tap(webcam => {
                send("webcam", {
                    position: [webcam.left, webcam.top]
                });
            }),
        )

        const ping$ = interval(30 * 1000).pipe(
            tap(i => socket.ping()),
        );

        merge(
            woth$,
            webcam$,
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