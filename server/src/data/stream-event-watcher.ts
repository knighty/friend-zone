import { distinctUntilChanged, map } from "rxjs";
import { Mippy } from "../mippy/mippy";
import { UserAuthTokenSource } from "./twitch/auth-tokens";
import { twitchSocket } from "./twitch/socket";

type Broadcaster = {
    requester_user_id: number,
    requester_user_login: string,
    requester_user_name: string,
}

type Requester = {
    requester_user_id: number,
    requester_user_login: string,
    requester_user_name: string,
}

type BroadcasterCondition = {
    broadcaster_user_id: string,
}

type Event<Event, Condition = BroadcasterCondition> = {
    event: Event,
    condition: Condition,
}

type User = {
    user_name: string,
    user_login: string,
    user_id: string,
}

type PollChoice = {
    id: string,
    title: string,
    bits_votes: number,
    channel_points_votes: number,
    votes: number
}

type Events = {
    "channel.update": Event<{
        title: string,
        category_name: string
    }>,

    "channel.follow": Event<{
        user_name: string,
    }, BroadcasterCondition & {
        moderator_user_id: string
    }>,

    "channel.subscribe": Event<{
        user_name: string,
    }>,

    "channel.ad_break.begin": Event<{
        duration_seconds: number,
        started_at: string,
        is_automatic: boolean,
    } & Broadcaster & Requester>,

    "channel.chat_settings.update": Event<{
        emote_mode: boolean,
        follower_mode: boolean,
        follower_mode_duration_minutes: null,
        slow_mode: boolean,
        slow_mode_wait_time_seconds: number,
        subscriber_mode: boolean,
        unique_chat_mode: boolean
    } & Broadcaster, BroadcasterCondition & {
        user_id: string
    }>,

    "channel.channel_points_custom_reward_redemption.add": Event<{
        id: string,
        status: "unknown" | "unfulfilled" | "fulfilled" | "canceled",
        user_input: string,
        redeemed_at: string
    } & Broadcaster & User>,

    "channel.poll.end": Event<{
        id: string,
        title: string,
        choices: PollChoice[],
        bits_voting: {
            is_enabled: boolean,
            amount_per_vote: number
        },
        channel_points_voting: {
            is_enabled: boolean,
            amount_per_vote: number
        },
        status: "completed" | "archived" | "terminated",
        started_at: string,
        ended_at: string
    } & Broadcaster>,

    "channel.prediction.end": Event<Broadcaster & {
        id: string,
        title: string,
        winning_outcome_id: string,
        outcomes: {
            id: string,
            title: string,
            color: "blue" | "pink",
            users: number,
            channel_points: number,
            top_predictors: ({
                channel_points_won: number,
                channel_points_used: number
            } & User)[]
        }[],
        status: "resolved" | "canceled",
        started_at: string,
        ended_at: string
    }>
};

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
            mippy.ask("newFollower", { user: e.user_name }, { allowTools: false });
        });

        onEvent("channel.subscribe", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            mippy.ask("newSubscriber", { user: e.user_name }, { allowTools: false });
        });

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