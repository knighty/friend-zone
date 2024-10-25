import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

export type FollowersResponse = {
    total: number;
};

type Follower = {
    user_id: string,
    user_name: string,
    user_login: string,
    followed_at: string,
}

type Subscriber = {
    user_id: string,
    user_name: string,
    user_login: string,
}

export async function getFollowers(authToken: AuthTokenSource, userId: number): Promise<FollowersResponse> {
    const response = await twitchRequest<FollowersResponse>({
        method: "GET",
        path: `/helix/channels/followers`,
        params: {
            broadcaster_id: userId
        }
    }, authToken);

    return { total: response.total };
};

export async function getLatestFollower(authToken: AuthTokenSource, userId: string): Promise<Follower | undefined> {
    const response = await twitchRequest<JSONResponse<Follower>>({
        method: "GET",
        path: `/helix/channels/followers`,
        params: {
            broadcaster_id: userId,
            first: 1
        }
    }, authToken);

    return response.data.length > 0 ? response.data[0] : undefined;
};

export async function getLatestSubscriber(authToken: AuthTokenSource, userId: string): Promise<Subscriber | undefined> {
    const response = await twitchRequest<JSONResponse<Subscriber>>({
        method: "GET",
        path: `/helix/subscriptions`,
        params: {
            broadcaster_id: userId,
            first: 1
        }
    }, authToken);

    return response.data.length > 0 ? response.data[0] : undefined;
};