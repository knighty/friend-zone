import { distinctUntilChanged, map } from "rxjs";
import { Mippy } from "../mippy/mippy";
import { UserAuthTokenSource } from "./twitch/auth-tokens";
import { twitchSocket } from "./twitch/socket";

type Event = {
    event: any,
    condition: any
}

type Events = {
    "channel.update": {
        event: {
            title: string,
            category_name: string,
        },
        condition: {
            broadcaster_user_id: string
        }
    },
    "channel.follow": {
        event: {
            user_name: string,
        },
        condition: {
            broadcaster_user_id: string,
            moderator_user_id: string
        }
    },
    "channel.subscribe": {
        event: {
            user_name: string,
        },
        condition: {
            broadcaster_user_id: string,
        }
    }
    "channel.ad_break.begin": {
        event: {
            duration_seconds: number,
            started_at: string,
            is_automatic: boolean,
            broadcaster_user_id: number,
            broadcaster_user_login: string,
            broadcaster_user_name: string,
            requester_user_id: number,
            requester_user_login: string,
            requester_user_name: string,
        },
        condition: {
            broadcaster_user_id: string,
        }
    }
    "channel.chat_settings.update": {
        event: {
            broadcaster_user_id: number,
            broadcaster_user_login: string,
            broadcaster_user_name: string,
            emote_mode: boolean,
            follower_mode: boolean,
            follower_mode_duration_minutes: null,
            slow_mode: boolean,
            slow_mode_wait_time_seconds: number,
            subscriber_mode: boolean,
            unique_chat_mode: boolean
        },
        condition: {
            broadcaster_user_id: string,
            user_id: string
        }
    }
};

export class StreamEventWatcher {
    constructor() {
    }

    watch(authToken: UserAuthTokenSource, broadcasterId: string, mippy: Mippy) {
        const twitch_socket = twitchSocket(authToken);

        function onEvent<E extends keyof Events>(event: E, condition: Events[E]["condition"], version: string = "1") {
            return twitch_socket.on<{ event: Events[E]["event"] }, Events[E]["condition"]>(event, condition, version);
        }

        onEvent("channel.update", {
            broadcaster_user_id: broadcasterId
        }, "2").pipe(
            map(e => e.event.category_name),
            distinctUntilChanged()
        ).subscribe(category => {
            mippy.ask("setCategory", { category });
        });

        onEvent("channel.follow", {
            broadcaster_user_id: broadcasterId,
            moderator_user_id: broadcasterId
        }, "2").subscribe(e => {
            mippy.ask("newFollower", { user: e.event.user_name });
        });

        onEvent("channel.subscribe", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            mippy.ask("newSubscriber", { user: e.event.user_name });
        });

        onEvent("channel.ad_break.begin", {
            broadcaster_user_id: broadcasterId,
        }).subscribe(e => {
            mippy.ask("adBreak", { duration: e.event.duration_seconds });
        });

        onEvent("channel.chat_settings.update", {
            broadcaster_user_id: broadcasterId,
            user_id: broadcasterId
        }).pipe(
            map(e => e.event.emote_mode),
            distinctUntilChanged(),
        ).subscribe(emojiOnly => {
            mippy.ask("setEmojiOnly", { emojiOnly: emojiOnly });
        });
    }
}