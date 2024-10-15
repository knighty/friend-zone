import { exhaustMap, from, tap, throttleTime } from "rxjs";
import { logger } from "shared/logger";
import { createPoll } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { catchAndLog } from "../../../utils";
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

export function createPollPlugin(userToken: UserAuthTokenSource, broadcasterId: string, options: CreatePollPluginOptions): MippyPluginDefinition {
    return {
        name: "Create Poll",
        permissions: ["createPoll"],
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const sub = mippy.brain.observeTool("createPoll").pipe(
                    throttleTime(options.throttle ?? 60000),
                    exhaustMap(args => {
                        mippy.say(`I just set up a poll titled "${args.title}" for ${durationToSpeech(args.duration)}`);
                        log.info(`Creating a poll (${args.duration} seconds): \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                        return from(createPoll(userToken, broadcasterId, args.title, args.options, args.duration)).pipe(
                            tap(result => log.info("Successfully set up poll")),
                            catchAndLog()
                        );
                    })
                ).subscribe();

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

