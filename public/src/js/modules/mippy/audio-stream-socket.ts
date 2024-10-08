import { Observable, filter, fromEvent, map, takeUntil, tap } from "rxjs";
import { SpeechNodes } from "./speech-nodes";

const sampleRate = 22050;
export class AudioStreamSocket {
    socket: WebSocket;

    constructor() {
        this.socket = new WebSocket(`ws://${document.location.host}/audio/websocket`);
        this.socket.binaryType = "arraybuffer";
    }

    getStream(audioContext: AudioContext, id: number, estimatedDuration: number) {
        return new Observable<SpeechNodes>(subscriber => {
            const speechNodes = new SpeechNodes(audioContext);
            speechNodes.estimatedDuration = estimatedDuration;

            subscriber.next(speechNodes);

            this.socket.send(new Int16Array([id]));
            const message$ = fromEvent<MessageEvent>(this.socket, "message").pipe(
                map(e => new Int16Array(e.data))
            );
            const finished$ = message$.pipe(filter(data => data.length == 1 && data[0] == 0));

            return message$.pipe(
                takeUntil(finished$),
                tap(data => speechNodes.append(data, sampleRate)),
            ).subscribe({
                complete: () => {
                    speechNodes.finalize();
                    subscriber.complete();
                }
            })
        })
    }
}