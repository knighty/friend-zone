import { filter, Observable, share } from "rxjs";
import { StreamEventWatcher } from "./stream-event-watcher";
import { Events } from "./twitch/event-sub/events";

export class Redemptions {
    source: Observable<Events["channel.channel_points_custom_reward_redemption.add"]["event"]>;

    constructor(streamEventWater: StreamEventWatcher, broadcasterId: string) {
        this.source = streamEventWater.onEvent("channel.channel_points_custom_reward_redemption.add", { broadcaster_user_id: broadcasterId }).pipe(
            share()
        );
    }

    onRedeem(id: string) {
        return this.source.pipe(
            filter(d => d.reward.id == id)
        )
    }
}