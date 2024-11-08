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

type Category = {
    box_art_url: string,
    name: string,
    id: string
}

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

export async function searchCategories(authToken: AuthTokenSource, category: string) {
    const response = await twitchRequest<JSONResponse<Category>>({
        method: "GET",
        path: `/helix/search/categories`,
        params: {
            query: category
        }
    }, authToken);

    return response.data;
};

export async function setChannelInformation(authToken: AuthTokenSource, broadcasterId: string, info: Partial<{
    title: string,
    game_id: string
}>) {
    const response = await twitchRequest<JSONResponse<StreamResponse>>({
        method: "PATCH",
        path: `/helix/channels`,
        params: {
            broadcaster_id: broadcasterId
        }
    }, authToken, info);

    return response.data.reduce((state, stream) => {
        state.viewers += stream.viewer_count;
        return state;
    }, { viewers: 0 });
}