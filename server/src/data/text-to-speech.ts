
import fs from "fs";
import { green } from "kolorist";
import { exec } from "node:child_process";
import path from "node:path";
import { EMPTY, from, map, mergeMap, Observable, of, Subject } from "rxjs";
import { logger } from "shared/logger";

const log = logger("piper");
const rhubarbLog = logger("rhubarb");

const synthesisRequest$ = new Subject<{
    text: string
}>();

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

const outputDir = path.join(__dirname, "../../../tts/output");
const piperDir = path.join(__dirname, "../../../tts/piper");
const rhubarbDir = path.join(__dirname, "../../../tts/rhubarb");
let i = 0;

type MouthShape = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";

type Phoneme = {
    shape: MouthShape,
    time: number
}

type SynthesisResult = {
    filename: string,
    duration: number,
    phonemes: Phoneme[],
}

type RhubarbOutput = {
    metadata: {
        soundFile: string,
        duration: number
    },
    mouthCues: {
        start: number,
        end: number,
        value: MouthShape
    }[]
}

async function generateLipShapes(filepath: string) {
    return new Promise<RhubarbOutput>((resolve, reject) => {
        //rhubarbLog.info(`Generating lip shapes...`);
        const startTime = performance.now();
        const e = exec(
            `${path.join(rhubarbDir, "rhubarb")} -f json "${filepath}"`,
            function (error, stdout, stderr) {
                if (error) {
                    reject(error);
                } else {
                    const endTime = performance.now();
                    const output = JSON.parse(stdout) as RhubarbOutput;
                    rhubarbLog.info(`Generated ${green(output.mouthCues.length)} lip shapes in ${green(Math.floor(endTime - startTime) + "ms")}`);
                    resolve(output)
                }
            }
        )
    });
}

export function synthesizeVoice(text: string, lipShapes = false): Observable<SynthesisResult> {
    if (!text)
        return EMPTY;

    return new Observable<Omit<SynthesisResult, "phonemes">>(subscriber => {
        const tempFileName = path.join(outputDir, "temp.txt");
        const id = makeid(10);
        const filename = `output-${id}.wav`;
        const filepath = path.join(outputDir, filename);
        text = text.replaceAll("*", "");
        fs.writeFileSync(tempFileName, text);
        //log.info(`Synthesizing text...`);
        const startTime = performance.now();
        const e = exec(
            `type "${tempFileName}" | "${path.join(piperDir, "piper")}" --model "${path.join(piperDir, "en_US-ryan-high.onnx")}" --output_file "${filepath}"`,
            function (error, stdout, stderr) {
                if (error) {
                    subscriber.error(error);
                } else {
                    const stats = fs.statSync(filepath);
                    const bytesPerSecond = 352_000 / 8;
                    const bytes = stats.size;
                    const endTime = performance.now();
                    log.info(`Synthesized text in ${green(Math.floor(endTime - startTime) + "ms")} to ${green(filename)}`);
                    subscriber.next({
                        filename,
                        duration: bytes / bytesPerSecond * 1000
                    });
                    subscriber.complete();
                }
            }
        )
    }).pipe(
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
    )

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