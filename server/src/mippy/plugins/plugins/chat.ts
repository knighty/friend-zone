import { distinct, EMPTY, filter, map, switchMap, withLatestFrom } from "rxjs";
import { log } from "shared/logger";
import { awaitResult, shuffle } from "shared/utils";
import { Stream } from "../../../data/stream";
import TwitchChat from "../../../data/twitch-chat";
import { getChatMembers } from "../../../data/twitch/api/chat";
import { AuthTokenSource } from "../../../data/twitch/auth-tokens";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
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

export function chatPlugin(twitchChat: TwitchChat, stream: Stream, authToken: AuthTokenSource, broadcasterId: string): MippyPluginDefinition {
    return {
        name: "Twitch Chat",
        permissions: ["sendMessage"],
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>) {
            const mode$ = config.observe("welcomeMode");
            const ignoreUsers$ = config.observe("ignoreUsers").pipe(
                map(str => str.map(str => str.toLowerCase().trim()))
            )

            if (mippy.brain instanceof ChatGPTMippyBrain) {
                mippy.brain.tools.register(
                    "get_users_in_chat",
                    "Gets a list of the users in the stream chat",
                    undefined,
                    "",
                    ["admin", "chat", "moderator"],
                    async tool => {
                        const [error, users] = await awaitResult(getChatMembers(authToken, broadcasterId));
                        if (error) {
                            log.error(error);
                            return "There was an error geting the list of chatters";
                        }
                        shuffle(users);
                        return `# Chat Members:\n${users.slice(0, 10).map(user => user.user_name).join("\n")}`;
                    }
                )
            }

            stream.whenLive(mode$).pipe(
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