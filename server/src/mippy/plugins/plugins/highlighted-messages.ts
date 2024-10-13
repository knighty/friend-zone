import { filter, map, merge, withLatestFrom } from "rxjs";
import TwitchChat, { TwitchChatLog } from "../../../data/twitch-chat";
import { MippyPlugin } from "../plugins";

export function highlightedMessagesPlugin(twitchChat: TwitchChat, twitchChatLog: TwitchChatLog, textFilter: RegExp | null): MippyPlugin {
    return {
        name: "Highlighted Messages",
        init: async mippy => {
            const message$ = merge(
                twitchChat.observeMessages().pipe(
                    filter(message => message.highlighted),
                    map(message => ({ user: message.user, text: message.text }))
                ),
                twitchChat.observeCommand("mippyask").pipe(
                    map(command => ({ user: command.user, text: command.arguments.join(" ") }))
                )
            )

            const sub = message$.pipe(
                withLatestFrom(twitchChatLog.observeLastMessages(50)),
            ).subscribe(([message, logs]) => {
                const prompt = { source: "chat", store: false, name: message.user } as const;
                if (textFilter) {
                    if (message.text.match(textFilter)) {
                        mippy.ask("highlightedMessage", { message: "(the message was filtered, tell the user to be careful with their word usage)", user: message.user, logs: "" }, prompt)
                        return;
                    }
                }
                mippy.ask("highlightedMessage", {
                    message: message.text.substring(0, 500),
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