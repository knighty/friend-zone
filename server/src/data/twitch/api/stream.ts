import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

export type StreamResponse = {
    id: string;
    user_id: string;
    user_login: string;
    user_name: string;
    game_id: string;
    game_name: string;
    type: string;
    title: string;
    tags: string[];
    viewer_count: number;
    started_at: string;
    language: string;
    thumbnail_url: string;
    tag_ids: string[];
    is_mature: false;
};

export async function getStream(authToken: AuthTokenSource, userId: number): Promise<StreamResponse | undefined> {
    const response = await twitchRequest<JSONResponse<StreamResponse>>({
        method: "GET",
        path: `/helix/streams?user_id=${userId}`,
    }, authToken, true);

    if (response.data.length == 0)
        return undefined;

    return response.data[0];
};