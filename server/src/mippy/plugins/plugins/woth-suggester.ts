import { green } from "kolorist";
import { EMPTY, interval, merge, partition, switchMap, tap, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { SubtitlesLog } from "../../../data/subtitles/logs";
import WordOfTheHour from "../../../data/word-of-the-hour";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { Mippy } from "../../mippy";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const pluginConfig = {
    automatedFrequency: {
        name: "Automated Frequency",
        description: "How often to change the word of the hour in minutes",
        type: "number",
        default: 0,
        max: 60,
        min: 1,
        step: 1
    },
    suggestedWordCount: {
        name: "Suggested Word Count",
        description: "How many words for Mippy to consider when selecting a word",
        type: "number",
        default: 10,
        max: 50,
        min: 1,
        step: 1
    }
} satisfies MippyPluginConfigDefinition;

const log = logger("woth-suggester-plugin");
export function wothSuggesterPlugin(subtitlesLog: SubtitlesLog, wordOfTheHour: WordOfTheHour): MippyPluginDefinition {
    const init = async (mippy: Mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
        let canRequest = true;
        if (mippy.brain instanceof ChatGPTMippyBrain) {
            const [word$, empty$] = partition(mippy.brain.observeTool("suggestWordOfTheHour"), args => args.word != "");

            const suggest$ = merge(
                empty$,
                config.observe("automatedFrequency").pipe(
                    switchMap(automatedTimer => {
                        if (automatedTimer > 0) {
                            log.info(`Automated word chosen ${green("enabled")} - Changing every ${green(automatedTimer)} minutes`);
                            return interval(automatedTimer * 1000 * 60);
                        }
                        log.info(`Automated word choosing ${green("disabled")}`);
                        return EMPTY;
                    })
                )
            ).pipe(
                withLatestFrom(config.observe("suggestedWordCount")),
                switchMap(([a, words]) => subtitlesLog.analyzeLogs({
                    wordCounts: words
                })),
                tap(analysis => {
                    log.info("Automated word of the hour being chosen...")
                    mippy.ask("suggestWordOfTheHour", {
                        mostSaidWords: analysis.mostSaidWords.map(w => w.word).join(", "),
                    }, {
                        allowTools: true,
                        source: "admin",
                        role: "system"
                    })
                })
            )

            const set$ = word$.pipe(
                tap(args => {
                    log.info(`Setting word of the hour to "${args.word}" from Mippy`);
                    wordOfTheHour.setWord(args.word, "Mippy");
                })
            );

            const sub = merge(suggest$, set$).subscribe();

            return {
                disable() {
                    sub.unsubscribe();
                },
            }
        }

        return null;
    }

    return {
        name: "Word Of The Hour Suggester",
        permissions: ["setWordOfTheHour", "sendMessage"],
        config: pluginConfig,
        init: init
    }
}

