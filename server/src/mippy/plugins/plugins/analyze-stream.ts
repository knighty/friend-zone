import fs from "fs/promises";
import path from "path";
import { concatMap } from "rxjs";
import { logger } from "shared/logger";
import { httpReadableStream } from "shared/network";
import { SubtitlesLog } from "../../../data/subtitles/logs";
import { randomString } from "../../../utils";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginDefinition } from "../plugins";

export async function downloadImage(imageUrl: string) {
    const url = new URL(imageUrl);
    const stream = httpReadableStream(url);
    const filename = `${randomString(20)}.jpg`;
    await fs.writeFile(path.join(__dirname, `../../../../../public/downloads/images/${filename}`), stream);
    return filename;
}

const log = logger("analyze-stream-plugin");
export function analyzeStreamPlugin(subtitlesLog: SubtitlesLog): MippyPluginDefinition {
    return {
        name: "Analyze Stream",
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const sub = mippy.brain.observeToolMessage("analyzeStream").pipe(
                    concatMap(async message => {
                        const imageBuffer = await downloadImage(`https://static-cdn.jtvnw.net/previews-ttv/live_user_artosis-960x540.jpg`);
                        mippy.ask
                    }),
                ).subscribe()

                return {
                    disable() {
                        sub.unsubscribe();
                    },
                }
            }

            return null;
        }
    }
}

