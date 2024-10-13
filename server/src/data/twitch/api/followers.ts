import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";

export type FollowersResponse = {
    total: number;
};

export async function getFollowers(authToken: AuthTokenSource, userId: number): Promise<FollowersResponse> {
    const response = await twitchRequest<FollowersResponse>({
        method: "GET",
        path: `/helix/channels/followers?broadcaster_id=${userId}`,
    }, authToken, true);

    return { total: response.total };
};