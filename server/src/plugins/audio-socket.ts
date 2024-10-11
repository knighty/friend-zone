import fs from "fs/promises";
import path from "path";
import { Observable, startWith, Subject, switchMap, takeWhile } from "rxjs";
import { ttsDirs } from "../data/tts/tts";
import { getWavHeader } from "../lib/wav-header";

const sampleRate = 22050;
const bufferDuration = 2;

function makeid(length: number) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}

export class AudioStream {
    buffer: Int16Array;
    isComplete: boolean = false;
    length: number = 0;
    id: string;
    update$ = new Subject<void>();
    nullAudio = 0;
    header: Uint8Array;
    persisted = false;

    constructor(id: string) {
        this.id = id;
        this.buffer = new Int16Array(0);
        this.header = getWavHeader();
    }

    static fromBuffer(id: string, file: Buffer): AudioStream {
        const stream = new this(id);
        stream.header = new Uint8Array(file.buffer, 0, 44);
        stream.buffer = new Int16Array(file.buffer, 44, (file.byteLength - 44) / 2);
        stream.isComplete = true;
        stream.length = stream.buffer.length;
        return stream;
    }

    get duration() {
        return this.length / sampleRate;
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
        const update$ = this.update$.pipe(startWith(undefined));
        let offset = 0;
        return update$.pipe(
            takeWhile(() => !this.isComplete, true),
            switchMap(() => {
                return new Observable<Uint8Array>(subscriber => {
                    while (offset < this.length) {
                        let end = offset + bufferDuration * sampleRate;
                        // If it's close to the end, just fold it in
                        if (end + sampleRate * bufferDuration > this.length) {
                            end = this.length;
                        }
                        const b = this.buffer.subarray(offset, end);
                        offset += b.length;
                        if (b.length > 0) {
                            subscriber.next(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
                        }
                    }
                    subscriber.complete();
                })
            }),
            startWith(this.header),
        )
    }

    getReadableStream() {
        const stream = this;
        let i = 0;
        return new ReadableStream({
            start(controller) {
                stream.observe().subscribe({
                    next: data => {
                        try {
                            controller.enqueue(data)
                        } catch (e) {
                            console.error(e);
                        }
                    },
                    complete: () => {
                        try {
                            controller.close();
                        } catch (e) {
                            console.error(e);
                        }
                    }
                })
            }
        });
    }
}

export class AudioRepository {
    streams: Record<string, AudioStream> = {};

    getFilename(id: string) {
        return path.join(ttsDirs.outputDir, `${id}.wav`);
    }

    create() {
        const stream = new AudioStream(makeid(10));
        this.streams[stream.id] = stream;
        // Delete after 10 minutes
        setTimeout(async () => {
            const file = await fs.writeFile(this.getFilename(stream.id), this.streams[stream.id].getReadableStream());
            delete this.streams[stream.id];
        }, 1000 * 100);
        return stream;
    }

    async getStream(id: string) {
        if (this.streams[id]) {
            return this.streams[id];
        }
        const file = await fs.readFile(this.getFilename(id));
        this.streams[id] = AudioStream.fromBuffer(id, file);
        return this.streams[id];
    }
}