import { EMPTY, filter, map, switchMap, tap } from "rxjs";
import TwitchChat from "../../../data/twitch-chat";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

function getDay(date: Date) {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
}

const pluginConfig = {
    welcomeMode: {
        name: "Welcome",
        description: "Who to welcome to the stream",
        type: "enum",
        default: "none",
        values: {
            "none": "None",
            "firstChat": "First Time Chatters",
            "everyone": "Everyone",
        }
    }
} satisfies MippyPluginConfigDefinition;

export function chatPlugin(twitchChat: TwitchChat): MippyPluginDefinition {
    return {
        name: "Twitch Chat",
        permissions: ["sendMessage"],
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>) {
            const mode$ = config.observe("welcomeMode");
            const usersSeen = new Set<string>();

            const firstMessageThisStream$ = twitchChat.observeMessages().pipe(
                filter(message => !usersSeen.has(message.user)),
                map(message => ({ user: message.user, info: "It's their first message here today" }))
            )

            mode$.pipe(
                switchMap(mode => {
                    switch (mode) {
                        case "everyone":
                            return firstMessageThisStream$;
                        case "firstChat":
                            return twitchChat.observeFirstMessages().pipe(
                                map(message => ({ user: message.user, info: "It's their first time ever posting in the chat" }))
                            );
                        default:
                            return EMPTY;
                    }
                }),
                tap(message => usersSeen.add(message.user))
            ).subscribe(message => {
                mippy.ask("sayHi", message, { source: "chat" })
            });

            return {
                disable() {

                },
            };
        },
    }
}