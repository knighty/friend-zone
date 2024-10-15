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
        path: `/helix/streams`,
        params: {
            user_id: userId
        }
    }, authToken);

    if (response.data.length == 0)
        return undefined;

    return response.data[0];
};

export async function getCategoryStreamsInfo(authToken: AuthTokenSource, categoryId: string) {
    const response = await twitchRequest<JSONResponse<StreamResponse>>({
        method: "GET",
        path: `/helix/streams`,
        params: {
            game_id: categoryId,
            type: "live",
            first: 100,
        }
    }, authToken);

    return response.data.reduce((state, stream) => {
        state.viewers += stream.viewer_count;
        return state;
    }, { viewers: 0 });
};