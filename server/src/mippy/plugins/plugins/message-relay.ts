import { green } from "kolorist";
import { EMPTY, switchMap, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { truncateString, wordCount } from "shared/text-utils";
import { TwitchMessageSender } from "../../../data/twitch/message-sender";
import { catchAndLog } from "../../../utils";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";
import { MippyVoicePlugin } from "./voice";

const log = logger("message-relay-plugin");

const pluginConfig = {
    maxLength: {
        name: "Max Length",
        description: "The maximum length of a relayed message. Will truncate longer. Twitch allows up to 500 max so 450 is the cap for safety.",
        type: "number",
        default: 450,
        max: 450,
        min: 100,
    },
    enabled: {
        name: "Enabled",
        description: "",
        type: "boolean",
        default: false
    }
} satisfies MippyPluginConfigDefinition;

export function relayMessagesToTwitchPlugin(messageSender: TwitchMessageSender): MippyPluginDefinition {
    return {
        name: "Twitch Chat Message Relay",
        permissions: ["sendMessage"],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            const voicePlugin = mippy.getPlugin<MippyVoicePlugin>("voice");

            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const maxLength$ = config.observe("maxLength");

                const source$ = config.observe("enabled").pipe(
                    switchMap(enabled => enabled ? voicePlugin.relayMessage$ : EMPTY)
                )

                const sub = source$.pipe(
                    withLatestFrom(maxLength$),
                    switchMap(([message, maxLength]) => {
                        if (message == "") {
                            return EMPTY;
                        }
                        const text = truncateString(message, maxLength);
                        log.info(`Sending twitch chat message with ${green(wordCount(text))} words`);
                        return messageSender(text);
                    }),
                    catchAndLog()
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

