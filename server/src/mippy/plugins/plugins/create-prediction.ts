import { green } from "kolorist";
import { Observable, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { Stream } from "../../../data/stream";
import { createPrediction, endPrediction } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { TwitchMessageSender } from "../../../data/twitch/message-sender";
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

type Prediction = {
    title: string,
    id: string,
    outcomes: { title: string, id: string }[]
}

export function createPredictionPlugin(userToken: UserAuthTokenSource, broadcasterId: string, messageSender: TwitchMessageSender, stream: Stream, options: CreatePredictionPluginOptions): MippyPluginDefinition {
    return {
        name: "Create Prediction",
        permissions: ["createPrediction"],
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const brain = mippy.brain;

                const sub = new Observable<Prediction>(subscriber => {
                    brain.tools.register<{
                        title: string,
                        options: string[],
                        duration: number
                    }>("createPrediction", "Creates a prediction. Call this when the user asks you to create a prediction", {
                        type: "object",
                        additionalProperties: false,
                        properties: {
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
                        required: ["title", "options", "duration"]
                    }, "", ["admin", "moderator"], async (tool) => {
                        const args = tool.function.arguments;
                        const message = `${args.title}\n${args.options.map((option, i) => `${i + 1}. ${option}`).join("\n")}`;
                        log.info(message);
                        //await messageSender(message);
                        subscriber.next({
                            id: "test",
                            title: args.title,
                            outcomes: args.options.map(outcome => ({
                                id: "bleh",
                                title: outcome
                            }))
                        });
                        return "Prediction was set up";
                        try {
                            const prediction = await createPrediction(userToken, broadcasterId, args.title, args.options, args.duration)
                            subscriber.next({
                                id: prediction.id,
                                title: prediction.title,
                                outcomes: prediction.outcomes.map(outcome => ({
                                    id: outcome.id,
                                    title: outcome.title
                                }))
                            });
                            return "Prediction was set up";
                        } catch (e) {
                            return "Unable to set up prediction";
                        }
                    });
                }).pipe(
                    switchMap(prediction => {
                        return new Observable(subscriber => {
                            // End tool
                            const endTool = brain.tools.register<{
                                option: string
                            }>(
                                "endPrediction",
                                "Ends a prediction. Call this when the user asks you to end a prediction with a winning option. If you're at all unsure about which option won, you can ask for clarification",
                                {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        option: {
                                            description: "Which option won the prediction",
                                            type: "string",
                                            enum: prediction.outcomes.map(outcome => outcome.title)
                                        }
                                    },
                                    required: ["option"]
                                },
                                "",
                                ["admin", "moderator"],
                                async tool => {
                                    const outcome = prediction.outcomes.find(outcome => outcome.title == tool.function.arguments.option);
                                    subscriber.complete();
                                    if (outcome) {
                                        log.info(`Resolved the prediction with ${green(outcome.title)} as the winner`)
                                        await endPrediction(userToken, broadcasterId, prediction.id, "RESOLVED", outcome.id);
                                        return "Prediction ended";
                                    }
                                    return "Failed to end the prediction";
                                }
                            )

                            // Cancel tool
                            const cancelTool = brain.tools.register<{
                                option: string
                            }>(
                                "cancelPrediction",
                                "Cancels a prediction. Call this when the user asks you to cancel a prediction",
                                undefined,
                                "",
                                ["admin", "moderator"],
                                async tool => {
                                    await endPrediction(userToken, broadcasterId, prediction.id, "CANCELED");
                                    subscriber.complete();
                                    return "Cancelled prediction";
                                }
                            );

                            return () => {
                                endTool.unregister();
                                cancelTool.unregister();
                            }
                        })
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

