import { green } from "kolorist";
import child_process from "node:child_process";
import path from "path";
import { EMPTY, Observable } from "rxjs";
import { logger } from "shared/logger";
import { executionTimer } from "shared/utils";
import { Phoneme } from "./rhubarb";
import { ttsDirs } from "./tts";

export type SynthesisResult = {
    filename: string,
    duration: number,
    phonemes?: Phoneme[],
}

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

const log = logger("piper");

export function synthesizeVoice(text: string, lipShapes = false): Observable<SynthesisResult> {
    if (!text)
        return EMPTY;

    return new Observable<Omit<SynthesisResult, "phonemes">>(subscriber => {
        const id = makeid(10);
        const filename = `output-${id}.wav`;
        const filepath = path.join(ttsDirs.outputDir, filename);
        text = text.replaceAll("*", "");
        const synthesisTimer = executionTimer();

        const piper = child_process.spawn("piper", [
            `--model`, "en_US-ryan-high.onnx",
            `--output-file`, filepath
        ], {
            cwd: ttsDirs.piper,
        });
        piper.stdin.end(text);

        piper.addListener("exit", () => {
            log.info(`Synthesized text in ${green(synthesisTimer.end())} to ${green(filename)}`);
            subscriber.next({
                filename,
                duration: 0
            });
            subscriber.complete();
        });
    })

    /*.pipe(
        mergeMap(result => {
            return lipShapes ? from(generateLipShapes(path.join(outputDir, result.filename))).pipe(
                map<RhubarbOutput, SynthesisResult>(rhubarbOutput => ({
                    ...result,
                    phonemes: rhubarbOutput.mouthCues.map(cue => ({ shape: cue.value, time: cue.start }))
                }))
            ) : of({
                ...result,
                phonemes: []
            })
        })
    )*/

    /*log.info(`--output_file=${path.join(__dirname, "../../../welcome.wav")}`);
    const piper = child_process.spawn("piper", [
        `--model=${path.join(__dirname, "../../../tts/piper/en_US-hfc_female-medium.onnx")}`,
        `--output_file=${path.join(__dirname, "../../../welcome.wav")}`,
        `--debug`,
        '/dev/stdin',
    ], {
        cwd: path.join(__dirname, "../../../tts/piper"),
    });
    piper.stdin.end(text);*/
}