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

type Broadcaster = {
    requester_user_id: number,
    requester_user_login: string,
    requester_user_name: string,
}
type User = {
    user_name: string,
    user_login: string,
    user_id: string,
}

export type PollChoice = {
    id: string,
    title: string,
    bits_votes: number,
    channel_points_votes: number,
    votes: number
}

export type Events = {
    "channel.cheer": Event<Broadcaster & User & {
        is_anonymous: boolean;
        message: string;
        bits: number;
    }>;

    "channel.update": Event<{
        title: string;
        category_name: string;
        category_id: string;
    }>;

    "channel.follow": Event<{
        user_name: string;
    }, BroadcasterCondition & {
        moderator_user_id: string;
    }>;

    "channel.subscribe": Event<{
        user_name: string;
    }>;

    "channel.ad_break.begin": Event<{
        duration_seconds: number;
        started_at: string;
        is_automatic: boolean;
    } & Broadcaster & Requester>;

    "channel.chat_settings.update": Event<{
        emote_mode: boolean;
        follower_mode: boolean;
        follower_mode_duration_minutes: null;
        slow_mode: boolean;
        slow_mode_wait_time_seconds: number;
        subscriber_mode: boolean;
        unique_chat_mode: boolean;
    } & Broadcaster, BroadcasterCondition & {
        user_id: string;
    }>;

    "channel.channel_points_custom_reward_redemption.add": Event<{
        id: string;
        status: "unknown" | "unfulfilled" | "fulfilled" | "canceled";
        user_input: string;
        redeemed_at: string;
        reward: {
            id: string,
            title: string,
            prompt: string,
            cost: number
        }
    } & Broadcaster & User>;

    "channel.poll.end": Event<{
        id: string;
        title: string;
        choices: PollChoice[];
        bits_voting: {
            is_enabled: boolean;
            amount_per_vote: number;
        };
        channel_points_voting: {
            is_enabled: boolean;
            amount_per_vote: number;
        };
        status: "completed" | "archived" | "terminated";
        started_at: string;
        ended_at: string;
    } & Broadcaster>;

    "channel.prediction.end": Event<Broadcaster & {
        id: string;
        title: string;
        winning_outcome_id: string;
        outcomes: {
            id: string;
            title: string;
            color: "blue" | "pink";
            users: number;
            channel_points: number;
            top_predictors: ({
                channel_points_won: number;
                channel_points_used: number;
            } & User)[];
        }[];
        status: "resolved" | "canceled";
        started_at: string;
        ended_at: string;
    }>;

    "channel.subscription.message": Event<User & Broadcaster & {
        tier: number;
        message: {
            text: string;
            emotes: [];
        };
        cumulative_months: number;
        streak_months: number | null;
        duration_months: number;
    }>;
};
