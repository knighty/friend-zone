import { distinctUntilChanged, map } from "rxjs";
import { Mippy } from "../mippy/mippy";
import { UserAuthTokenSource } from "./twitch/auth-tokens";
import { Events } from "./twitch/event-sub/events";
import { twitchSocket } from "./twitch/socket";

export class StreamEventWatcher {
    constructor() {
    }

    watch(authToken: UserAuthTokenSource, broadcasterId: string, mippy: Mippy) {
        const twitch_socket = twitchSocket(authToken);

        function onEvent<E extends keyof Events>(event: E, condition: Events[E]["condition"], version: string = "1") {
            return twitch_socket.on<{ event: Events[E]["event"] }, Events[E]["condition"]>(event, condition, version).pipe(
                map(e => e.event)
            );
        }

        onEvent("channel.update", {
            broadcaster_user_id: broadcasterId
        }, "2").pipe(
            map(e => e.category_name),
            distinctUntilChanged()
        ).subscribe(category => {
            mippy.ask("setCategory", { category }, { allowTools: false });
        });

        onEvent("channel.follow", {
            broadcaster_user_id: broadcasterId,
            moderator_user_id: broadcasterId
        }, "2").subscribe(e => {
            mippy.ask("newFollower", { user: e.user_name }, { name: e.user_name, allowTools: false });
        });

        onEvent("channel.subscribe", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            mippy.ask("newSubscriber", { user: e.user_name }, { name: e.user_name, allowTools: false });
        });

        onEvent("channel.subscription.message", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            mippy.ask("resubscribe", { user: e.user_name, months: e.duration_months.toString(), message: e.message.text }, { name: e.user_name, allowTools: false });
        });

        /*onEvent("channel.cheer", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            mippy.ask("cheer", { user: e.user_name, bits: e.bits.toString(), message: e.message }, { name: e.user_name, allowTools: false });
        });*/

        /*onEvent("channel.ad_break.begin", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            mippy.ask("adBreak", { duration: e.duration_seconds }, { allowTools: false });
        });*/

        onEvent("channel.chat_settings.update", {
            broadcaster_user_id: broadcasterId,
            user_id: broadcasterId
        }).pipe(
            map(e => e.emote_mode),
            distinctUntilChanged(),
        ).subscribe(emojiOnly => {
            mippy.ask("setEmojiOnly", { emojiOnly: emojiOnly }, { allowTools: false });
        });

        onEvent("channel.poll.end", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            const won = e.choices.reduce((max, choice) => {
                return choice.votes > max.votes ? choice : max
            }, e.choices[0]);
            mippy.ask("pollEnd", {
                title: e.title,
                won: won.title,
                votes: won.votes
            }, { allowTools: false });
        });

        onEvent("channel.prediction.end", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
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
            }, { allowTools: false });
        });

        /*onEvent("channel.channel_points_custom_reward_redemption.add", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(event => {
            if (event.event.reward.id == "") {
                mippy.ask("askMippy", { user: event.event.user_name, question: event.event.reward.prompt });
            }
        });*/
    }
}