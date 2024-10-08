
import { green } from "kolorist";
import child_process, { exec } from "node:child_process";
import path from "node:path";
import { EMPTY, from, map, mergeMap, Observable, of, Subject } from "rxjs";
import { logger } from "shared/logger";
import { executionTimer } from "shared/utils";

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
        const id = makeid(10);
        const filename = `output-${id}.wav`;
        const filepath = path.join(outputDir, filename);
        text = text.replaceAll("*", "");
        const synthesisTimer = executionTimer();

        const piper = child_process.spawn("piper", [
            `--model`, "en_US-ryan-high.onnx",
            `--output-file`, filepath
        ], {
            cwd: piperDir,
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


let id = 0;
export function streamSynthesizeVoice(text: string, lipShapes = false): Observable<Int16Array> {
    if (!text)
        return EMPTY;

    return new Observable<Int16Array>(subscriber => {
        const synthesisTimer = executionTimer();
        let segments = 0;
        let size = 0;
        id++;
        text = text.replaceAll("*", "");
        const piper = child_process.spawn("piper", [
            `--model`, "en_US-ryan-high.onnx",
            `--output-raw`, `-q`
        ], {
            cwd: piperDir,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        piper.stdin.end(text);

        //piper.stdout.setEncoding("binary");
        piper.stdout.addListener("data", data => {
            const a = new Int16Array(data.buffer);
            segments++;
            size += a.length * 2;
            subscriber.next(a);
        });

        piper.addListener("close", () => {
            log.info(`Synthesized ${green(`${Math.floor(size / 1000)}kb`)} (${green(segments)} segments) of text in ${green(synthesisTimer.end())}`);

            subscriber.complete();
        });
    })

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