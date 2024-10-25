import { distinctUntilChanged, EMPTY, filter, from, map, Observable, switchMap } from "rxjs";
import { log } from "shared/logger";
import { StreamEventWatcher } from "../../../data/stream-event-watcher";
import { getCategoryStreamsInfo } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const redemptions = {
    askMippy: "",
    personality: "",
}

const eventConfig = {
    channelUpdate: {
        name: "Channel Updates",
        description: "Channel updates for example, eg: game changes",
        type: "boolean",
        default: false as boolean
    },
    subscriptions: {
        name: "Subscriptions",
        description: "Subscribes and resubscribe messages",
        type: "boolean",
        default: false
    },
    follows: {
        name: "Follows",
        description: "When a user follows the channel",
        type: "boolean",
        default: false
    },
    chatSettings: {
        name: "Chat Settings",
        description: "Changes to chat settings, eg: emoji only mode",
        type: "boolean",
        default: false
    },
    pollsAndPredictions: {
        name: "Polls and Predictions",
        description: "When polls and predictions end",
        type: "boolean",
        default: false
    },
    adBreaks: {
        name: "Ad Breaks",
        description: "When an ad break is run",
        type: "boolean",
        default: false
    },
    cheers: {
        name: "Cheers",
        description: "When a user cheers with bits",
        type: "boolean",
        default: false
    },
    redemptions: {
        name: "Redemptions",
        description: "When a user redeems something",
        type: "boolean",
        default: false
    },
} satisfies MippyPluginConfigDefinition;

const pluginConfig = {
    ...eventConfig
} satisfies MippyPluginConfigDefinition;

function append<In extends Record<string, any>, Out extends Record<string, any>, Result>(fn: (v: In) => Observable<Out>, selector: (a: In, b: Out) => Result) {
    return (a: In) => fn(a).pipe(
        map(v => selector(a, v))
    );
}

export function streamEventsPlugin(authToken: UserAuthTokenSource, broadcasterId: string, streamEventWatcher: StreamEventWatcher): MippyPluginDefinition {
    return {
        name: "Stream Events",
        permissions: ["sendMessage"],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            const broadcaster = { broadcaster_user_id: broadcasterId };

            function event<T>(key: keyof typeof eventConfig, observable: Observable<T>) {
                return config.observe(key).pipe(
                    distinctUntilChanged(),
                    switchMap(v => v ? observable : EMPTY)
                )
            }

            event("channelUpdate",
                streamEventWatcher.onEvent("channel.update", broadcaster, "2").pipe(
                    switchMap(event => from(getCategoryStreamsInfo(authToken, event.category_id)).pipe(
                        map(data => ({ ...data, ...event }))
                    )),
                    //switchMap(append(event => from(getCategoryStreamsInfo(authToken, event.category_id)))),
                    distinctUntilChanged((a, b) => a.category_id == b.category_id),
                )
            ).subscribe(event => {
                mippy.ask("setCategory", { category: event.category_name, viewers: event.viewers.toString() }, { allowTools: false });
            });

            event("follows", streamEventWatcher.onEvent("channel.follow", {
                broadcaster_user_id: broadcasterId,
                moderator_user_id: broadcasterId
            }, "2")).subscribe(e => {
                mippy.ask("newFollower", { user: e.user_name }, { name: e.user_name, allowTools: false });
            });

            event("subscriptions", streamEventWatcher.onEvent("channel.subscribe", broadcaster)).subscribe(e => {
                mippy.ask("newSubscriber", { user: e.user_name }, { name: e.user_name, allowTools: false });
            });

            event("subscriptions", streamEventWatcher.onEvent("channel.subscription.message", broadcaster)).subscribe(e => {
                mippy.ask("resubscribe", { user: e.user_name, months: e.duration_months.toString(), message: e.message.text }, { name: e.user_name, allowTools: false });
            });

            event("cheers", streamEventWatcher.onEvent("channel.cheer", broadcaster)).subscribe(e => {
                mippy.ask("cheer", { user: e.user_name, bits: e.bits.toString(), message: e.message }, { name: e.user_name, allowTools: false });
            });

            event("adBreaks", streamEventWatcher.onEvent("channel.ad_break.begin", broadcaster)).subscribe(e => {
                mippy.ask("adBreak", { duration: e.duration_seconds }, { allowTools: false });
            });

            event("redemptions", streamEventWatcher.onEvent("channel.channel_points_custom_reward_redemption.add", broadcaster)).subscribe(data => {
                switch (data.id) {
                    case redemptions.askMippy: {
                        mippy.ask("highlightedMessage", {
                            user: data.user_name,
                            message: data.user_input,
                            logs: ""
                        }, { store: false, source: "chat" })
                    } break;

                    case redemptions.personality: {
                        if (mippy.brain instanceof ChatGPTMippyBrain) {
                            mippy.brain.setPersonality("");
                        }
                    } break;
                }
                if (data.id == redemptions.askMippy) {
                    try {
                        if (mippy.brain instanceof ChatGPTMippyBrain) {
                            mippy.brain.setPersonality("");
                        }
                        //mippy.getPlugin<MippyVoicePlugin>("voice").setVoice("glados");
                    } catch (e) {
                        log.error(e);
                    }
                }
            });

            event("chatSettings", streamEventWatcher.onEvent("channel.chat_settings.update", {
                broadcaster_user_id: broadcasterId,
                user_id: broadcasterId
            })).pipe(
                map(e => e.emote_mode),
                distinctUntilChanged(),
            ).subscribe(emojiOnly => {
                mippy.ask("setEmojiOnly", { emojiOnly: emojiOnly }, { allowTools: false });
            });

            event("pollsAndPredictions", streamEventWatcher.onEvent("channel.poll.end", broadcaster)).pipe(
                filter(e => e.status == "completed")
            ).subscribe(e => {
                const won = e.choices.reduce((max, choice) => {
                    return choice.votes > max.votes ? choice : max
                }, e.choices[0]);
                mippy.ask("pollEnd", {
                    title: e.title,
                    won: won.title,
                    votes: won.votes
                }, { allowTools: false });
            });

            event("pollsAndPredictions", streamEventWatcher.onEvent("channel.prediction.end", broadcaster)).subscribe(e => {
                const winningOutcome = e.outcomes.find(outcome => outcome.id == e.winning_outcome_id);
                if (winningOutcome == null)
                    return;

                const losingOutcomes = e.outcomes.filter(outcome => outcome.id != winningOutcome.id);
                const topWinner = winningOutcome.top_predictors.reduce((winner: null | { user_name: string, channel_points_won: number }, predictor) => {
                    if (winner == null || predictor.channel_points_won > winner.channel_points_won) {
                        return predictor;
                    }
                    return winner;
                }, null);
                const topLoser = losingOutcomes.reduce((loser: null | { user_name: string, channel_points_used: number }, outcome) => {
                    outcome.top_predictors.forEach(predictor => {
                        if (loser == null || predictor.channel_points_used > loser.channel_points_used) {
                            loser = predictor;
                        }
                    })
                    return loser;
                }, null);
                const pointsUsed = e.outcomes.reduce((points, outcome) => points + outcome.channel_points, 0);
                const winnerString = topWinner != null ? `The biggest winner was ${topWinner.user_name} who won ${topWinner.channel_points_won}.` : ``;
                const loserString = topLoser != null ? `The biggest loser was ${topLoser.user_name} who lost ${topLoser.channel_points_used}.` : ``;
                mippy.ask("predictionEnd", {
                    title: e.title,
                    data: `${winnerString} ${loserString}`,
                    points: pointsUsed,
                    topWinner: topWinner?.user_name ?? "",
                    topWinnerPoints: topWinner?.channel_points_won ?? "",
                    topLoser: topLoser?.user_name ?? "",
                    topLoserPoints: topLoser?.channel_points_used ?? 0,
                }, { allowTools: false, role: "system" });
            });

            return {}
        }
    }
}