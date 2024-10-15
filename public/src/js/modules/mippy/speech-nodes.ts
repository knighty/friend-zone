import { BehaviorSubject, Observable, Subject, filter, finalize, find, from, interval, map, merge, of, switchMap, take, takeUntil, tap, withLatestFrom } from "rxjs";
import { renderLoop$ } from "shared/rx";

export type AudioPlayEvent = {
    played: number,
    duration: number,
    currentTime: number
}

type SegmentAudioNode = {
    audioNode: AudioBufferSourceNode;
}

export type SpeechSegment = {
    start: number,
    duration: number,
    node: AudioBufferSourceNode
}

export class SpeechNodes {
    segments: SpeechSegment[] = [];
    segmentAdded$ = new Subject<SpeechSegment>();
    isFinalised$ = new BehaviorSubject(false);
    estimatedDuration: number = 1;
    audioContext: AudioContext;

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;
    }

    private addSegment(node: AudioBufferSourceNode, start: number, duration: number) {
        const segment = { start, node, duration };
        this.segments.push(segment);
        this.segmentAdded$.next(segment);
    }

    append(data: Int16Array, sampleRate = 22050) {
        const context = this.audioContext;
        const node = context.createBufferSource();
        const buffer = context.createBuffer(1, data.length, sampleRate);
        const bufferData = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            bufferData[i] = data.at(i) / 32768;
        }
        node.buffer = buffer;
        const duration = data.length / sampleRate;
        const offset = this.segments.reduce((a, c) => a + c.duration, 0);
        this.addSegment(node, offset, duration);
    }

    finalize() {
        this.isFinalised$.next(true);
    }

    play(destination: AudioNode) {
        const context = this.audioContext;
        const segments$ = merge(this.segmentAdded$, from(this.segments));
        let startTime = context.currentTime;

        return segments$.pipe(
            take(1),
            switchMap(segment => {
                return new Observable<AudioPlayEvent>(subscriber => {
                    const finished$ = this.isFinalised$.pipe(
                        filter(finalized => finalized),
                        switchMap(() => {
                            const duration = this.segments.reduce((a, c) => a + c.duration, 0)
                            return renderLoop$.pipe(
                                find(() => context.currentTime > startTime + duration)
                            )
                        }),
                        take(1)
                    )

                    const accurateDuration$ = this.isFinalised$.pipe(
                        filter(v => v),
                        map(() => this.segments.reduce((a, c) => a + c.duration, 0))
                    );

                    const duration$ = merge(of(this.estimatedDuration), accurateDuration$).pipe(
                        tap(d => console.log(d))
                    );

                    interval(100).pipe(
                        withLatestFrom(duration$),
                        map(([frame, duration]) => {
                            const currentTime = context.currentTime - startTime;
                            //const duration = this.segments.reduce((a, c) => a + c.duration, 0)
                            return {
                                played: currentTime / duration,
                                duration: duration,
                                currentTime: currentTime
                            }
                        }),
                        takeUntil(finished$),
                    ).subscribe(data => subscriber.next(data));

                    return segments$.pipe(
                        tap(segment => {
                            segment.node.connect(destination);
                            if (startTime + segment.start < context.currentTime) {
                                startTime = context.currentTime - segment.start;
                            }
                            segment.node.start(startTime + segment.start);
                        }),
                        finalize(() => {
                            for (let segment of this.segments) {
                                segment.node.stop();
                                segment.node.disconnect();
                            }
                        }),
                        takeUntil(finished$)
                    ).subscribe({
                        complete: () => subscriber.complete()
                    });
                })
            })
        )
    }

    dispose() {

    }
}