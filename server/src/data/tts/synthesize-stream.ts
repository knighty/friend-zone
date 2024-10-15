import { green } from "kolorist";
import child_process from "node:child_process";
import { EMPTY, Observable } from "rxjs";
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

export function streamSynthesizeVoice(text: Observable<string>): Observable<StreamSynthesisResult> {
    const piperArgs = [
        `--model`, "en_US-norman-medium.onnx",
        `--output-raw`, `-q`
    ];

    let currentPos = 0;
    let str = "";

    const partials$ = text.pipe(
        <In extends Observable<string>>(source: In) => {
            return new Observable<[string, number]>(subscriber => {
                return source.subscribe({
                    next: value => {
                        str = value;
                        if (str.length - currentPos > 200) {
                            const regex = /[\.\?\!\n](?: |\b|$)/g;
                            let endIndex = lastIndexOfRegex(str, regex);
                            if (endIndex > currentPos - 200) {
                                subscriber.next([str, endIndex]);
                                currentPos = endIndex;
                            }
                        }
                    },
                    complete: () => {
                        if (str == "") {
                            log.error("Somehow completed partials without getting any text");
                        }
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
            text = text.substring(pos, endPos);
            pos = endPos;
            if (text == "")
                return EMPTY;
            log.info(`Synthesizing ${green(text.split(" ").length)} words`);

            return new Observable<StreamSynthesisResult>(subscriber => {
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

                piper.addListener("close", () => {
                    log.info(`Synthesized ${green(`${Math.floor(size / 1000)}kb`)} (${green(segments)} segments) of text in ${green(synthesisTimer.end())}`);
                    subscriber.next({
                        text,
                    });
                    subscriber.complete();
                });
            })
        })
    );
}