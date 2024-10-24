import { exhaustMap, from, tap, throttleTime } from "rxjs";
import { logger } from "shared/logger";
import { createPrediction } from "../../../data/twitch/api";
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

const log = logger("create-prediction-plugin");

export type CreatePredictionPluginOptions = {
    throttle?: number
}

export function createPredictionPlugin(userToken: UserAuthTokenSource, broadcasterId: string, options: CreatePredictionPluginOptions): MippyPluginDefinition {
    return {
        name: "Create Prediction",
        permissions: ["createPrediction"],
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const sub = mippy.brain.observeTool("createPrediction").pipe(
                    throttleTime(options.throttle ?? 60000),
                    exhaustMap(args => {
                        mippy.say(`I just set up a prediction titled "${args.title}" for ${durationToSpeech(args.duration)}`);
                        log.info(`Creating a prediction: \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                        return from(createPrediction(userToken, broadcasterId, args.title, args.options, args.duration)).pipe(
                            tap(result => log.info("Successfully set up prediction")),
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

