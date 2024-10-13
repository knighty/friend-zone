import { Observable, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { SubtitlesLog } from "../../../data/subtitles/logs";
import WordOfTheHour from "../../../data/word-of-the-hour";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPlugin } from "../plugins";

const log = logger("woth-suggester-plugin");
export function wothSuggesterPlugin(subtitlesLog: SubtitlesLog, wordOfTheHour: WordOfTheHour, automatedTimer$?: Observable<void>): MippyPlugin {
    return {
        name: "Word Of The Hour Suggester",
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const sub = mippy.brain.observeTool("suggestWordOfTheHour").subscribe(data => {
                    log.info(`Setting word of the hour to "${data.word}" from Mippy`);
                    wordOfTheHour.setWord(data.word, "Mippy");
                })

                if (automatedTimer$) {
                    log.info("Automated timer running...")
                    automatedTimer$.pipe(
                        switchMap(subtitlesLog.analyzeLogs)
                    ).subscribe(analysis => {
                        log.info("Automated word of the hour being chosen...")
                        mippy.ask("suggestWordOfTheHour", {
                            mostSaidWords: analysis.mostSaidWords.map(item => `${item.word}: ${item.count}`).join(", "),
                        }, {
                            allowTools: true,
                            source: "admin"
                        })
                    })
                }

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

