import { green } from "kolorist";
import { EMPTY, interval, switchMap, tap, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { arrayRandom } from "shared/utils";
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
const useChatGptToPick = false;
export function wothSuggesterPlugin(subtitlesLog: SubtitlesLog, wordOfTheHour: WordOfTheHour): MippyPluginDefinition {
    const init = async (mippy: Mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
        if (mippy.brain instanceof ChatGPTMippyBrain) {
            const tool$ = mippy.brain.tools.register<{
                word: string
            }>(
                "set_word_of_the_hour",
                "Function to call to change the word of the hour. Use when you're asked to set the word of the hour",
                {
                    word: {
                        description: "The word to use. Provide an empty string if you're asked to disable word of the hour",
                        type: "string"
                    }
                },
                "",
                ["admin", "moderator"],
                async tool => {
                    const word = tool.function.arguments.word;
                    log.info(`Setting word of the hour to "${word}" from Mippy`);
                    wordOfTheHour.setWord(word, "Mippy", false);
                    if (word != "") {
                        return `Word of the hour has been set to ${word}`
                    } else {
                        return "Word of the hour has been disabled";
                    }
                }
            )

            const wothTool$ = mippy.brain.tools.register<{
                word: string
            }>(
                "get_word_of_the_hour_counts",
                "Gets a list of how many times the word of the hour has been said",
                undefined,
                "",
                ["admin", "moderator"],
                async tool => {
                    return Array.from(wordOfTheHour.counts.data.entries()).map(([user, count]) => `${user}: ${count}`).join("\n");
                }
            )

            const suggest$ = config.observe("automatedFrequency").pipe(
                switchMap(automatedTimer => {
                    if (automatedTimer > 0) {
                        log.info(`Automated word chosen ${green("enabled")} - Changing every ${green(automatedTimer)} minutes`);
                        return interval(automatedTimer * 1000 * 60);
                    }
                    log.info(`Automated word choosing ${green("disabled")}`);
                    return EMPTY;
                }),
                withLatestFrom(config.observe("suggestedWordCount")),
                switchMap(([a, words]) => subtitlesLog.analyzeLogs({
                    wordCounts: words
                })),
                tap(analysis => {
                    log.info("Automated word of the hour being chosen...")
                    if (useChatGptToPick) {
                        mippy.ask("suggestWordOfTheHour", {
                            mostSaidWords: analysis.mostSaidWords.map(w => w.word).join(", "),
                        }, {
                            allowTools: true,
                            source: "admin",
                            role: "system"
                        })
                    } else {
                        wordOfTheHour.setWord(arrayRandom(analysis.mostSaidWords)?.word ?? null, "Mippy");
                    }
                })
            ).subscribe();

            return {
                disable() {
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

