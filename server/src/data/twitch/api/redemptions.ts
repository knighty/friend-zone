import { twitchRequest } from "../api";
import { UserAuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

type Status = "CANCELED" | "LOCKED" | "RESOLVED";

type Image = {
    url_1x: string,
    url_2x: string,
    url_4x: string
}

export type Redemption = {
    broadcaster_name: string,
    broadcaster_login: string,
    broadcaster_id: number,
    id: string,
    image: null | Image,
    background_color: string,
    is_enabled: true,
    cost: 50000,
    title: string,
    prompt: string,
    is_user_input_required: boolean,
    max_per_stream_setting: {
        is_enabled: boolean,
        max_per_stream: number
    },
    max_per_user_per_stream_setting: {
        is_enabled: boolean,
        max_per_user_per_stream: number
    },
    global_cooldown_setting: {
        is_enabled: boolean,
        global_cooldown_seconds: number
    },
    is_paused: boolean,
    is_in_stock: boolean,
    default_image: Image,
    should_redemptions_skip_request_queue: boolean,
    redemptions_redeemed_current_stream: null | number,
    cooldown_expires_at: string | null
};

export async function getRedemptions(authToken: UserAuthTokenSource, broadcasterId: string): Promise<Redemption[]> {
    const response = await twitchRequest<JSONResponse<Redemption>>({
        method: "GET",
        path: `/helix/channel_points/custom_rewards`,
        params: {
            broadcaster_id: broadcasterId
        }
    }, authToken);

    return response.data;
}