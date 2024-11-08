import { green } from "kolorist";
import { EMPTY, filter, merge, Observable, switchMap, take, takeUntil, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { awaitResult } from "shared/utils";
import { Stream } from "../../../data/stream";
import { createPrediction, endPrediction } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { TwitchMessageSender } from "../../../data/twitch/message-sender";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

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

type Prediction = {
    title: string,
    id: string,
    outcomes: { title: string, id: string }[]
}

const pluginConfig = {
    canEnd: {
        name: "Can End Predictions",
        description: "Whether predictions can be resolved/cancelled",
        type: "boolean",
        default: true as boolean,
    }
} satisfies MippyPluginConfigDefinition

export function createPredictionPlugin(userToken: UserAuthTokenSource, broadcasterId: string, messageSender: TwitchMessageSender, stream: Stream, options: CreatePredictionPluginOptions): MippyPluginDefinition {
    return {
        name: "Create Prediction",
        permissions: ["createPrediction"],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const brain = mippy.brain;

                const sub = new Observable<Prediction>(subscriber => {
                    brain.tools.register<{
                        title: string,
                        options: string[],
                        duration: number
                    }>("create_prediction",
                        "Creates a prediction. Call this when the user asks you to create a prediction",
                        {
                            title: {
                                description: "The title of the prediction",
                                type: "string"
                            },
                            options: {
                                type: "array",
                                description: "The list of options for the prediction",
                                items: {
                                    type: "string"
                                }
                            },
                            duration: {
                                type: "number",
                                description: "The duration of the prediction in seconds. Default is 180 seconds",
                            }
                        },
                        "",
                        ["admin", "moderator"],
                        async (tool) => {
                            const args = tool.function.arguments;
                            const message = `${args.title}\n${args.options.map((option, i) => `${i + 1}. ${option}`).join("\n")}`;
                            log.info(message);
                            const [error, prediction] = await awaitResult(createPrediction(userToken, broadcasterId, args.title, args.options, args.duration));
                            if (error) {
                                log.error(error);
                                return `Failed to set up the prediction`;
                            }
                            subscriber.next({
                                id: prediction.id,
                                title: prediction.title,
                                outcomes: prediction.outcomes.map(outcome => ({
                                    id: outcome.id,
                                    title: outcome.title
                                }))
                            });
                            return "Prediction was set up";
                        }
                    );
                }).pipe(
                    withLatestFrom(config.observe("canEnd")),
                    switchMap(([prediction, canEnd]) => {
                        if (!canEnd) {
                            return EMPTY;
                        }
                        return merge(
                            // End tool
                            brain.tools.observe<{
                                option: string
                            }>(
                                "end_prediction",
                                "Ends a prediction. Call this when the user asks you to end a prediction with a winning option. If you're at all unsure about which option won, you can ask for clarification",
                                {
                                    option: {
                                        description: "Which option won the prediction",
                                        type: "string",
                                        enum: prediction.outcomes.map(outcome => outcome.title)
                                    }
                                },
                                "",
                                ["admin", "moderator"],
                                async tool => {
                                    const outcome = prediction.outcomes.find(outcome => outcome.title == tool.function.arguments.option);
                                    if (!outcome) {
                                        return `None of the outcomes match ${tool.function.arguments.option}`;
                                    }
                                    log.info(`Resolved the prediction with ${green(outcome.title)} as the winner`)
                                    const [error] = await awaitResult(endPrediction(userToken, broadcasterId, prediction.id, "RESOLVED", outcome.id));
                                    if (error) {
                                        log.error(error);
                                        return "Couldn't end the prediction for some reason";
                                    }
                                    return "Prediction ended";
                                }
                            ),

                            // Cancel tool
                            brain.tools.observe(
                                "cancel_prediction",
                                "Cancels a prediction. Call this when the user asks you to cancel a prediction",
                                undefined,
                                "",
                                ["admin", "moderator"],
                                async tool => {
                                    const [error] = await awaitResult(endPrediction(userToken, broadcasterId, prediction.id, "CANCELED"));
                                    if (error) {
                                        log.error(error);
                                        return "Couldn't cancel the prediction for some reason";
                                    }
                                    return "Cancelled prediction";
                                }
                            )
                        ).pipe(
                            take(1),
                            takeUntil(config.observe("canEnd").pipe(filter(canEnd => canEnd == false)))
                        )
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

