import { filter, map, merge, switchMap, withLatestFrom } from "rxjs";
import TwitchChat, { TwitchChatLog } from "../../../data/twitch-chat";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const pluginConfig = {
    maxLength: {
        name: "Max Length",
        description: "The maximum length of a highlighted message. Will truncate longer",
        type: "number",
        default: 500,
        max: 500,
        min: 100,
        step: 10,
    },
    chatLogCount: {
        name: "Chat Log Count",
        description: "How many chat log entries to feed in with the prompt",
        type: "number",
        default: 50,
        max: 100,
        min: 0,
        step: 5,
    }
} satisfies MippyPluginConfigDefinition;

export function highlightedMessagesPlugin(twitchChat: TwitchChat, twitchChatLog: TwitchChatLog): MippyPluginDefinition {
    return {
        name: "Highlighted Messages",
        permissions: ["sendMessage"],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            const message$ = merge(
                twitchChat.observeMessages().pipe(
                    filter(message => message.highlighted),
                    map(message => ({ user: message.user, text: message.text }))
                ),
                twitchChat.observeCommand("mippyask").pipe(
                    map(command => ({ user: command.user, text: command.arguments.join(" ") }))
                )
            )

            const chatLog$ = config.observe("chatLogCount").pipe(switchMap(count => twitchChatLog.observeLastMessages(count)));
            const maxLength$ = config.observe("maxLength");

            const sub = message$.pipe(
                withLatestFrom(chatLog$, maxLength$),
            ).subscribe(([message, logs, maxLength]) => {
                const prompt = { source: "chat", store: false, name: message.user } as const;
                if (mippy.isFilteredText(message.text)) {
                    mippy.ask("highlightedMessage", { message: "(the message was filtered, tell the user to be careful with their word usage)", user: message.user, logs: "" }, prompt)
                    return;
                }
                mippy.ask("highlightedMessage", {
                    message: message.text.substring(0, maxLength),
                    user: message.user,
                    logs: logs.length > 0 ? `# Chat Log
${logs.join("\n")}` : ``
                }, prompt)
            });

            return {
                name: "Highlighted Messages",
                disable() {
                    sub.unsubscribe();
                },
            }
        }
    }
}