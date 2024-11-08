import { green } from "kolorist";
import child_process from "node:child_process";
import { Observable, throttleTime } from "rxjs";
import { logger } from "shared/logger";
import { exhaustMapWithTrailing } from "shared/rx";
import { lastIndexOfRegex } from "shared/text-utils";
import { executionTimer } from "shared/utils";
import { ttsDirs } from "./tts";

export type StreamSynthesisResult = {
    text?: string,
    buffer?: Int16Array
};

function sanitizeText(text: string) {
    return text.replaceAll("*", "");
}

const log = logger("piper");

export function streamSynthesizeVoice(text: Observable<string>, voice: string): Observable<StreamSynthesisResult> {
    const piperArgs = [
        `--model`, voice,
        `--output-raw`, `-q`
    ];

    let currentPos = 0;
    let str = "";

    const partials$ = text.pipe(
        throttleTime(200, undefined, { trailing: true, leading: false }),
        <In extends Observable<string>>(source: In) => {
            return new Observable<[string, number]>(subscriber => {
                return source.subscribe({
                    next: value => {
                        str = value;
                        if (str.length - currentPos > 50) {
                            const regex = /[\.\?\!\n](?: |\b|$)/g;
                            let endIndex = lastIndexOfRegex(str, regex);
                            if (endIndex > -1 && endIndex > currentPos + 50) {
                                subscriber.next([str, endIndex]);
                                currentPos = endIndex;
                            }
                        }
                    },
                    complete: () => {
                        if (currentPos < str.length)
                            subscriber.next([str, str.length]);
                        subscriber.complete();
                    }
                })
            })
        }
    );

    let pos = 0;
    return partials$.pipe(
        exhaustMapWithTrailing(([text, endPos]) => {
            return new Observable<StreamSynthesisResult>(subscriber => {
                text = text.substring(pos, endPos);
                pos = endPos;
                if (text == "") {
                    log.info("Empty string");
                    subscriber.complete();
                    return;
                }

                const synthesisTimer = executionTimer();
                let segments = 0;
                let size = 0;
                text = sanitizeText(text);
                const piper = child_process.spawn("piper", piperArgs, {
                    cwd: ttsDirs.piper,
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                piper.stdin.end(text);

                piper.stdout.addListener("data", data => {
                    const a = new Int16Array(data.buffer);
                    segments++;
                    size += a.length * 2;
                    subscriber.next({
                        buffer: a
                    });
                });

                piper.stderr.addListener("data", data => {
                    subscriber.error(new Error(data.buffer.toString()));
                });

                piper.addListener("close", (code, signal) => {
                    const duration = (size / 2) / 22050;
                    const executionTime = synthesisTimer.duration();
                    log.info(`[${green(synthesisTimer.end())}] Synthesized ${green(`${duration.toFixed(2)}s`)} of voice [${green(text.split(" ").length)} words | ${green(((duration * 1000) / executionTime).toFixed(1))} rtf]`);
                    subscriber.next({
                        text,
                    });
                    subscriber.complete();
                });
            })
        })
    );
}