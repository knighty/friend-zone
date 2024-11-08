import { distinctUntilChanged, EMPTY, filter, map, Observable, switchMap } from "rxjs";
import { Stream } from "../../../data/stream";
import { StreamEventWatcher } from "../../../data/stream-event-watcher";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const eventConfig = {
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

export function streamEventsPlugin(authToken: UserAuthTokenSource, broadcasterId: string, streamEventWatcher: StreamEventWatcher, stream: Stream): MippyPluginDefinition {
    return {
        name: "Stream Events",
        permissions: ["sendMessage"],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            const broadcaster = { broadcaster_user_id: broadcasterId };

            function event<T>(key: keyof typeof eventConfig, observable: Observable<T>) {
                return stream.whenLive(config.observe(key)).pipe(
                    distinctUntilChanged(),
                    switchMap(v => v ? observable : EMPTY)
                )
            }

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

            event("pollsAndPredictions", streamEventWatcher.onEvent("channel.poll.end", broadcaster)).pipe(
                filter(e => e.status == "completed")
            ).subscribe(e => {
                const won = e.choices.reduce((max, choice) => choice.votes > max.votes ? choice : max);
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

                const topWinner = winningOutcome.top_predictors.length == 0 ? null : winningOutcome.top_predictors
                    .reduce((winner, predictor) => predictor.channel_points_won > winner.channel_points_won ? predictor : winner);

                const losers = e.outcomes
                    .filter(outcome => outcome.id != winningOutcome.id)
                    .flatMap(outcome => outcome.top_predictors);
                const topLoser = losers.length == 0 ? null : losers.reduce(
                    (loser, predictor) => predictor.channel_points_used > loser.channel_points_used ? predictor : loser
                );

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