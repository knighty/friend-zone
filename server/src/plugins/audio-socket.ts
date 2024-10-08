import { FastifyInstance } from "fastify";
import { concatMap, EMPTY, endWith, filter, fromEvent, Observable, startWith, Subject, takeUntil, tap } from "rxjs";

const sampleRate = 22050;
const bufferDuration = 2;

class AudioStream {
    buffer: Int16Array;
    isComplete: boolean = false;
    length: number = 0;
    id: number;
    update$ = new Subject<void>();
    nullAudio = 0;

    constructor(id: number) {
        this.id = id;
        this.buffer = new Int16Array(0);
    }

    append(data: Int16Array) {
        const hasAudio = data.some(value => value != 0);
        if (!hasAudio) {
            this.nullAudio += data.length;
            return;
        }
        const newBuffer = new Int16Array(this.nullAudio + this.buffer.length + data.length);
        newBuffer.set(this.buffer, 0);
        newBuffer.set(data, this.nullAudio + this.buffer.length);
        this.nullAudio = 0;
        this.buffer = newBuffer;
        this.length = newBuffer.length;
        this.update$.next();
    }

    complete() {
        this.isComplete = true;
        this.update$.next();
    }

    observe() {
        const update$ = this.update$.pipe(startWith());
        const complete$ = this.update$.pipe(filter(() => this.isComplete));
        let offset = 0;
        return update$.pipe(
            concatMap(() => {
                return new Observable<Int16Array>(subscriber => {
                    while (offset < this.length) {
                        let end = offset + bufferDuration * sampleRate;
                        // If it's close to the end, just fold it in
                        if (end + sampleRate * bufferDuration > this.length) {
                            end = this.length;
                        }
                        const b = this.buffer.subarray(offset, end);
                        offset += b.length;
                        subscriber.next(b);
                    }
                    subscriber.complete();
                })
            }),
            takeUntil(complete$)
        )
    }
}

export class StreamingTTS {
    streams: Record<number, AudioStream> = {};
    id = 0;

    create() {
        const id = this.id++;
        const stream = new AudioStream(id);
        this.streams[id] = stream;
        // Delete after 10 minutes
        setTimeout(() => delete this.streams[id], 1000 * 60 * 10);
        return stream;
    }

    getStream(id: number) {
        return this.streams[id];
    }
}

export const audioSocket = (tts: StreamingTTS, url: string = "/audio/websocket") => async (fastify: FastifyInstance, options: {}) => {
    fastify.get(url, { websocket: true }, (ws, req) => {
        ws.binaryType = "arraybuffer";

        const nullTerminator = new Int16Array(1);
        nullTerminator[0] = 0;

        fromEvent<MessageEvent>(ws, "message").pipe(
            concatMap(e => {
                try {
                    const id = (new Int16Array(e.data))[0];
                    const stream = tts.getStream(id);

                    return stream.observe().pipe(
                        endWith(nullTerminator),
                        tap(data => {
                            ws.send(data);
                        })
                    )
                } catch (e) {
                    ws.send(nullTerminator);
                    return EMPTY;
                }
            }),
            takeUntil(fromEvent(ws, "close"))
        ).subscribe();
    })
}