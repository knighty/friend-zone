import { green } from "kolorist";
import { exec } from "node:child_process";
import path from "path";
import { logger } from "shared/logger";
import { ttsDirs } from "./tts";

const rhubarbLog = logger("rhubarb");

export type MouthShape = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";

export type Phoneme = {
    shape: MouthShape,
    time: number
}

export type RhubarbOutput = {
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

export async function generateLipShapes(filepath: string) {
    return new Promise<RhubarbOutput>((resolve, reject) => {
        //rhubarbLog.info(`Generating lip shapes...`);
        const startTime = performance.now();
        const e = exec(
            `${path.join(ttsDirs.rhubarb, "rhubarb")} -f json "${filepath}"`,
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