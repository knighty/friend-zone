import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

export type UserResponse = {
    id: string;
    login: string;
    display_name: string;
    type: string;
    broadcaster_type: string;
    description: string;
    profile_image_url: string;
    offline_image_url: string;
    view_count: number;
    email: string;
    created_at: string;
};

export async function getUser(authToken: AuthTokenSource, user?: string): Promise<UserResponse> {
    const userResponse = await twitchRequest<JSONResponse<UserResponse>>({
        method: "GET",
        path: user ? `/helix/users?login=${user}` : `/helix/users`
    }, authToken, true);
    if (userResponse.data.length == 0)
        throw new Error("Couldn't find user");

    return userResponse.data[0];
};