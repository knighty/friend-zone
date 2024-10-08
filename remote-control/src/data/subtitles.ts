import { green, yellow } from "ansi-colors";
import child_process from "node:child_process";
import path from "path";
import { Observable } from "rxjs";
import { logger } from "shared/logger";
import { WhisperConfig } from "../config";

const subtitleLog = logger("subtitles");

type Subtitle = {
    id: number,
    text: string
}

export function observeSubtitles(config: WhisperConfig) {
    return new Observable<Subtitle>(subscriber => {
        subtitleLog.info("Starting up speech to text service");
        const pythonProcess = child_process.spawn('python', [
            path.join(__dirname, "/../../../whisper/transcribe_demo.py"),
            `--model=${config.model}`,
            `--phrase_timeout=${config.phrase_timeout}`,
            `--energy_threshold=${config.energy_threshold}`,
            `--min_probability=${config.min_probability}`,
            `--no_speech_threshold=${config.no_speech_threshold}`
        ]);
        pythonProcess.stdout.on('data', (data: string) => {
            const lines = data.toString().split(/[\r\n]/g);
            for (let subtitle of lines) {
                if (subtitle == "")
                    continue;
                const split = subtitle.split(" ");
                if (split[0] == "subtitle") {
                    const id = split[1];
                    const json = split.slice(2).join(" ").trim();
                    const segments = JSON.parse(json) as {
                        text: string,
                        probability: number
                    }[];
                    const text = segments
                        .filter(segment => segment.probability < config.min_probability)
                        .map(segment => segment.text)
                        .join("")
                        .trim();
                    const debugText = segments
                        .map(segment => segment.probability < config.min_probability ? green(`${segment.text} (${Math.floor(segment.probability * 100)}%)`) : yellow(`${segment.text} (${Math.floor(segment.probability * 100)}%)`))
                        .join("")
                        .trim();
                    if (text.length > 0) {
                        subscriber.next({
                            id: Number(id),
                            text
                        });
                    }
                    if (debugText.length > 0) {
                        subtitleLog.info(debugText);
                    }
                } else {
                    subtitleLog.info(subtitle);
                }
            }
        });
        pythonProcess.stderr.on('data', (data: string) => {
            console.log(data.toString());
        });

        return () => {
            pythonProcess.kill();
            subtitleLog.info("Ending speech to text service");
        }
    })
}