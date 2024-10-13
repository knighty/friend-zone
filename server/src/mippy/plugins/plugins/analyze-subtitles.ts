import { concatMap } from "rxjs";
import { logger } from "shared/logger";
import { SubtitlesLog } from "../../../data/subtitles/logs";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPlugin } from "../plugins";

const log = logger("analyze-subtitles-plugin");
export function analyzeSubtitlesPlugin(subtitlesLog: SubtitlesLog): MippyPlugin {
    return {
        name: "Analyze Subtitles",
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const sub = mippy.brain.observeTool("analyzeSubtitles").pipe(
                    concatMap(async () => {
                        const analysis = await subtitlesLog.analyzeLogs();
                        log.info(JSON.stringify(analysis));
                        mippy.ask("subtitlesAnalysis", {
                            mostSaidWords: analysis.mostSaidWords.map(item => `${item.word}: ${item.count}`).join(", "),
                            userWordsSaid: analysis.userWordsSaid.map(item => `${item.user}: ${item.count}`).join(", "),
                        })
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

