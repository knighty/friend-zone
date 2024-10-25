import { distinct, EMPTY, filter, map, switchMap, withLatestFrom } from "rxjs";
import TwitchChat from "../../../data/twitch-chat";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

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
    },
    ignoreUsers: {
        name: "Ignore Users",
        description: "Users to ignore, comma seperated",
        type: "string-array",
        default: ["mippybot", "nightbot"],
    }
} satisfies MippyPluginConfigDefinition;

export function chatPlugin(twitchChat: TwitchChat): MippyPluginDefinition {
    return {
        name: "Twitch Chat",
        permissions: ["sendMessage"],
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>) {
            const mode$ = config.observe("welcomeMode");
            const ignoreUsers$ = config.observe("ignoreUsers").pipe(
                map(str => str.map(str => str.toLowerCase().trim()))
            )

            mode$.pipe(
                switchMap(mode => {
                    switch (mode) {
                        case "everyone":
                            return twitchChat.observeMessages().pipe(
                                map(message => ({
                                    message,
                                    info: "It's their first message here today"
                                }))
                            );
                        case "firstChat":
                            return twitchChat.observeFirstMessages().pipe(
                                map(message => ({
                                    message,
                                    info: "It's their first message ever in the stream"
                                }))
                            );
                        default:
                            return EMPTY;
                    }
                }),
                withLatestFrom(ignoreUsers$),
                filter(([data, ignoreUsers]) => !ignoreUsers.includes(data.message.user.toLowerCase()) && !data.message.highlighted),
                distinct(([data]) => data.message.user),
            ).subscribe(([message]) => mippy.ask("sayHi", { user: message.message.user, info: message.info }, { source: "chat" }));

            return {
                disable() {

                },
            };
        },
    }
}