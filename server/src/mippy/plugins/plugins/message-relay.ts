import { green } from "kolorist";
import { from, switchMap, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { truncateString, wordCount } from "shared/text-utils";
import { sendChatMessage } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { catchAndLog } from "../../../utils";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const log = logger("message-relay-plugin");

const pluginConfig = {
    maxLength: {
        name: "Max Length",
        description: "The maximum length of a relayed message. Will truncate longer. Twitch allows up to 500 max so 450 is the cap for safety.",
        type: "number",
        default: 450,
        max: 450,
        min: 100,
    }
} satisfies MippyPluginConfigDefinition;

export function relayMessagesToTwitchPlugin(broadcasterId: string, botId: string, botToken: UserAuthTokenSource): MippyPluginDefinition {
    return {
        name: "Twitch Chat Message Relay",
        permissions: ["sendMessage"],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const maxLength$ = config.observe("maxLength");

                const sub = mippy.brain.observeCompleteMessages().pipe(
                    withLatestFrom(maxLength$),
                    switchMap(([message, maxLength]) => {
                        const text = truncateString(message.text, maxLength);
                        log.info(`Sending twitch chat message with ${green(wordCount(text))} words`);
                        return from(sendChatMessage(botToken, broadcasterId, botId, text)).pipe(catchAndLog());
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

