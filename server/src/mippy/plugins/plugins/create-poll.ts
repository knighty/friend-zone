import { Observable } from "rxjs";
import { logger } from "shared/logger";
import { Stream } from "../../../data/stream";
import { createPoll } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginDefinition } from "../plugins";

function durationToSpeech(duration: number) {
    if (duration >= 60) {
        const minutes = Math.floor(duration / 60);
        return `${minutes} minute${minutes == 1 ? "" : "s"}`;
    }
    return `${duration} seconds`;
}

const log = logger("create-poll-plugin");

export type CreatePollPluginOptions = {
    throttle?: number
}

export function createPollPlugin(userToken: UserAuthTokenSource, broadcasterId: string, stream: Stream, options: CreatePollPluginOptions): MippyPluginDefinition {
    return {
        name: "Create Poll",
        permissions: ["createPoll"],
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const brain = mippy.brain;
                const tool$ = new Observable(subscriber => {
                    const registration = brain.tools.register<{
                        title: string,
                        options: string[],
                        duration: number
                    }>(
                        "createPoll",
                        "Creates a poll. Call this when you're asked to make a poll or when you have a question you want the chat to answer.",
                        {
                            title: {
                                description: "The title of the poll",
                                type: "string"
                            },
                            options: {
                                type: "array",
                                description: "The list of options for the poll",
                                items: {
                                    type: "string"
                                }
                            },
                            duration: {
                                type: "number",
                                description: "The duration of the poll in seconds. Default is 30 seconds",
                            }
                        },
                        "",
                        ["admin", "moderator"],
                        async tool => {
                            const args = tool.function.arguments;
                            log.info(`Creating a poll (${args.duration} seconds): \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                            try {
                                const poll = await createPoll(userToken, broadcasterId, args.title, args.options, args.duration);
                                log.info(`Successfully set up poll`);
                                return `A poll was setup titled "${poll.title}" for ${durationToSpeech(poll.duration)}`;
                            } catch (e) {
                                log.error(e);
                                return `Failed to set up the poll`;
                            }
                        }
                    );

                    return () => registration.unregister();
                })

                const sub = stream.whenLive(tool$).subscribe();

                return {
                    disable() {
                        sub.unsubscribe()
                    }
                }
            }

            return null;
        }
    }
}

