import { concatMap, filter, merge, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { SubtitlesLog } from "../../../data/subtitles/logs";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const log = logger("analyze-subtitles-plugin");

const pluginConfig = {
    numWordsSaid: {
        name: "Number Of Words",
        description: "How many words to show",
        type: "number",
        default: 10,
        max: 20,
        min: 1,
        step: 1
    }
} satisfies MippyPluginConfigDefinition;

export function analyzeSubtitlesPlugin(subtitlesLog: SubtitlesLog): MippyPluginDefinition {
    return {
        name: "Analyze Subtitles",
        permissions: ["sendMessage"],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const sub = merge(
                    mippy.brain.observeTool("action").pipe(
                        filter(action => action.action == "analyze subtitles")
                    ),
                    mippy.brain.observeTool("analyzeSubtitles")
                ).pipe(
                    withLatestFrom(config.observe("numWordsSaid")),
                    concatMap(async ([args, numWordsSaid]) => {
                        const analysis = await subtitlesLog.analyzeLogs({
                            wordCounts: numWordsSaid
                        });
                        log.info(JSON.stringify(analysis));
                        mippy.ask("subtitlesAnalysis", {
                            mostSaidWords: analysis.mostSaidWords.map(item => `${item.word}: ${item.count}`).join(", "),
                            userWordsSaid: analysis.userWordsSaid.map(item => `${item.user}: ${item.count} words`).join(", "),
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

