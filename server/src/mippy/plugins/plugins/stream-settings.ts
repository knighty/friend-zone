import { green } from "kolorist";
import { EMPTY, merge, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { awaitResult } from "shared/utils";
import { searchCategories, setChannelInformation } from "../../../data/twitch/api/stream";
import { AuthTokenSource } from "../../../data/twitch/auth-tokens";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const pluginConfig = {
    setTitle: {
        name: "Set Title",
        description: "Whether Mippy can set the stream title",
        type: "boolean",
        default: false
    },
    setCategory: {
        name: "Set Category",
        description: "Whether Mippy can set the stream category",
        type: "boolean",
        default: false
    },
    chatSettings: {
        name: "Chat Settings",
        description: "Whether Mippy can set chat settings",
        type: "boolean",
        default: false
    }
} satisfies MippyPluginConfigDefinition;

const log = logger("stream-settings");

export function streamSettingsPlugin(authToken: AuthTokenSource, broadcasterId: string): MippyPluginDefinition {
    return {
        name: "Stream Settings",
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>) {
            const brain = mippy.brain;
            if (brain instanceof ChatGPTMippyBrain) {
                const sub =
                    merge(
                        config.observe("setTitle").pipe(
                            switchMap(enabled => enabled ? brain.tools.observe<{
                                title: string
                            }>(
                                "set_title",
                                "Set the title of the stream. Use when you're asked to set the title of the stream or when you think it'd be funny to change it.",
                                {
                                    title: {
                                        description: "String to set the stream title to",
                                        type: "string"
                                    }
                                },
                                "",
                                ["admin", "moderator"],
                                async tool => {
                                    const title = `Friend Zone: ${tool.function.arguments.title}`;
                                    log.info(`Set the title to ${green(title)}`);
                                    const [error] = await awaitResult(setChannelInformation(authToken, broadcasterId, {
                                        title: title
                                    }));
                                    if (error) {
                                        log.error(error);
                                        return `Error setting title ${error.message ?? ""}`
                                    }
                                    return `Successfully changed title to ${title}`;
                                }
                            ) : EMPTY)),

                        config.observe("setCategory").pipe(
                            switchMap(enabled => enabled ? brain.tools.observe<{
                                category: string
                            }>(
                                "set_category",
                                "Set the category of the stream. Use when you're specifically asked to set the category of the stream",
                                {
                                    category: {
                                        description: "Category to set the stream to",
                                        type: "string"
                                    }
                                },
                                "",
                                ["admin", "moderator"],
                                async tool => {
                                    const categories = await searchCategories(authToken, tool.function.arguments.category);
                                    if (categories.length > 0) {
                                        log.info(`Set the category to ${green(categories[0].name)}`)
                                        const [error] = await awaitResult(setChannelInformation(authToken, broadcasterId, {
                                            game_id: categories[0].id
                                        }))
                                        if (error) {
                                            log.error(error);
                                            return `Failed to set category: ${error.message ?? ""}`;
                                        }
                                        return `Successfully changed category to ${categories[0].name}`;
                                    } else {
                                        return "No categories were found with that name. Ask for clarification";
                                    }
                                }
                            ) : EMPTY),
                        )
                    ).subscribe()

                return {
                    disable() {
                        sub.unsubscribe();
                    },
                };
            }

            return null;
        },
    }
}