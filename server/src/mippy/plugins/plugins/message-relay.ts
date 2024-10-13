import { green } from "kolorist";
import { EMPTY, from, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { truncateString, wordCount } from "shared/text-utils";
import { sendChatMessage } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { catchAndLog } from "../../../utils";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPlugin } from "../plugins";

const log = logger("message-relay-plugin");
export function relayMessagesToTwitchPlugin(broadcasterId: string, botId: string, botToken: UserAuthTokenSource): MippyPlugin {
    return {
        name: "Twitch Chat Message Relay",
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const sub = mippy.brain.observeCompleteMessages().pipe(
                    switchMap(message => {
                        if (mippy.permissions.sendMessage) {
                            const text = truncateString(message.text, 450);
                            log.info(`Sending twitch chat message with ${green(wordCount(text))} words`);
                            return from(sendChatMessage(botToken, broadcasterId, botId, text)).pipe(catchAndLog());
                        }
                        return EMPTY;
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

