import https from "https";
import { green } from "kolorist";
import { logger } from "shared/logger";
import config from "../../config";
import { AuthTokenSource } from "./auth-tokens";

export type ChannelResponse = {
    broadcaster_id: string,
    broadcaster_login: string,
    broadcaster_name: string,
    broadcaster_language: string,
    game_id: string,
    game_name: string,
    title: string,
    delay: number,
    tags: string[],
    content_classification_labels: string[],
    is_branded_content: boolean
}

export type UserResponse = {
    id: string,
    login: string,
    display_name: string,
    type: string,
    broadcaster_type: string,
    description: string,
    profile_image_url: string,
    offline_image_url: string,
    view_count: number,
    email: string,
    created_at: string
}

export type StreamResponse = {
    id: string,
    user_id: string,
    user_login: string,
    user_name: string,
    game_id: string,
    game_name: string,
    type: string,
    title: string,
    tags: string[],
    viewer_count: number,
    started_at: string,
    language: string,
    thumbnail_url: string,
    tag_ids: string[],
    is_mature: false
}

export type PollResponse = {
    id: string,
    broadcaster_id: string,
    broadcaster_name: string,
    broadcaster_login: string,
    title: string,
    choices: {
        id: string,
        title: string,
        votes: number,
        channel_points_votes: number,
        bits_votes: number
    }[],
    bits_voting_enabled: boolean,
    bits_per_vote: number,
    channel_points_voting_enabled: boolean,
    channel_points_per_vote: number,
    status: "ACTIVE" | "COMPLETED" | "TERMINATED" | "ARCHIVED" | "MODERATED" | "INVALID";
    duration: number,
    started_at: string
}

export type PredictionResponse = {
    id: string,
    broadcaster_id: string,
    broadcaster_name: string,
    broadcaster_login: string,
    title: string,
    winning_outcome_id: number | null,
    outcomes: {
        id: string,
        title: string,
        users: number,
        channel_points: number,
        top_predictors: null,
        color: string
    }[],
    prediction_window: number,
    status: "ACTIVE" | "CANCELED" | "LOCKED" | "RESOLVED",
    created_at: string,
    ended_at: null,
    locked_at: null
}

export type FollowersResponse = {
    total: number
}

export type EventSub<T = any> = {
    type: string,
    version: string,
    condition: T,
    transport: {
        method: "webhooks",
        callback: string
    } | {
        method: "websocket",
        session_id: string
    }
}

export type EventSubResponse = {
    error: undefined,
    data: {
        id: string,
        status: string,
        type: string,
        version: string,
        cost: number,
        condition: any,
        transport: {
            method: string,
            callback?: string
        },
        created_at: string
    }[],
    total: number,
    total_cost: number,
    max_total_cost: number
}

export type EventSubError = {
    error: string,
    status: number,
    message: string
}

type EventSubListResponseItem = {
    id: string,
    status: string,
    type: string,
    version: string,
    cost: number,
    condition: any,
    created_at: string,
    transport: {
        method: "webhook" | "websocket",
    }
}

export type EventSubListResponse = {
    data: EventSubListResponseItem[],
    total: number,
    total_cost: number,
    max_total_cost: number,
    pagination: {}
}

function isEventSubError(response: EventSubResponse | EventSubError): response is EventSubError {
    return response.error != undefined;
}

class InvalidTokenError extends Error { }
class APICallError extends Error { }

const twitchLog = logger("twitch");

export async function twitchApiCall<T>(options: {
    path: string,
    method?: string,
}, authToken: AuthTokenSource, json: boolean = true, body?: any): Promise<T> {
    twitchLog.info(`Request: ${green(options.path)}`);

    const makeRequest = async (): Promise<T> => {
        const o = {
            host: 'api.twitch.tv',
            port: 443,
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${await authToken.get()}`,
                "Client-Id": config.twitch.clientId
            },
            ...options
        };

        if (options.method == "GET") {
            return new Promise((resolve, reject) => {
                const request = https.get(o, function (res) {
                    res.setEncoding('utf8');
                    let data = "";
                    res.on('data', function (chunk) {
                        data += chunk;
                    });
                    res.on("end", function () {
                        if (res.statusCode == 401) {
                            const json = JSON.parse(data);
                            if (json.message == "Invalid access token") {
                                reject(new InvalidTokenError("Access token invalid"));
                            } else {
                                reject(new APICallError(json.message));
                            }
                            return;
                        }
                        if (json) {
                            const json = JSON.parse(data);
                            resolve(<T>json);
                        } else {
                            resolve(data as T);
                        }
                    });
                });

                request.on("error", error => reject(error));
            })
        }
        if (options.method == "POST") {
            return new Promise((resolve, reject) => {
                const data = JSON.stringify(body);
                const request = https.request({
                    ...o,
                    headers: {
                        ...o.headers,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    }
                }, function (res) {
                    res.setEncoding('utf8');
                    let data = "";
                    res.on('data', function (chunk) {
                        data += chunk;
                    });
                    res.on("end", function () {
                        if (res.statusCode == 401) {
                            const json = JSON.parse(data);
                            if (json.message == "Invalid access token") {
                                reject(new InvalidTokenError("Access token invalid"));
                            } else {
                                reject(new APICallError(json.message));
                            }
                            return;
                        }
                        if (json) {
                            const json = JSON.parse(data);
                            resolve(<T>json);
                        } else {
                            resolve(data as T);
                        }
                    });
                });
                request.write(data);
                request.end();

                request.on("error", error => reject(error));
            })
        }
        if (options.method == "DELETE") {
            return new Promise((resolve, reject) => {
                const request = https.request({
                    ...o
                }, function (res) {
                    res.setEncoding('utf8');
                    let data = "";
                    res.on('data', function (chunk) {
                        data += chunk;
                    });
                    res.on("end", function () {
                        if (res.statusCode == 401) {
                            const json = JSON.parse(data);
                            if (json.message == "Invalid access token") {
                                reject(new InvalidTokenError("Access token invalid"));
                            } else {
                                reject(new APICallError(json.message));
                            }
                            return;
                        }
                        if (json) {
                            console.log(data);
                            const json = JSON.parse(data);
                            resolve(<T>json);
                        } else {
                            resolve(data as T);
                        }
                    });
                });
                request.on("error", error => reject(error));
                request.end();
            })
        }
        return Promise.reject();
    };

    try {
        return await makeRequest();
    } catch (e) {
        if (e instanceof InvalidTokenError) {
            twitchLog.info(`Request failed due to access token. Attempting refresh...`);
            await authToken.refresh();
            return await makeRequest();
        }
        throw e;
    }
}

type JSONResponse<T> = {
    data: T[]
};

export async function unsubscribeDisconnected(authToken: AuthTokenSource) {
    const response = await twitchApiCall<EventSubListResponse>({
        method: "GET",
        path: "/helix/eventsub/subscriptions?status=websocket_disconnected"
    }, authToken, true);
    for (let item of response.data) {
        await eventUnsub(authToken, item.id);
    }
}

export async function getUser(authToken: AuthTokenSource, user?: string): Promise<UserResponse> {
    const userResponse = await twitchApiCall<JSONResponse<UserResponse>>({
        method: "GET",
        path: user ? `/helix/users?login=${user}` : `/helix/users`
    }, authToken, true);
    if (userResponse.data.length == 0)
        throw new Error("Couldn't find user");

    return userResponse.data[0];
}

export async function getStream(authToken: AuthTokenSource, userId: number): Promise<StreamResponse | undefined> {
    const streamResponse = await twitchApiCall<JSONResponse<StreamResponse>>({
        method: "GET",
        path: `/helix/streams?user_id=${userId}`,
    }, authToken, true);

    if (streamResponse.data.length == 0)
        return undefined;

    return streamResponse.data[0];
}

export async function getFollowers(authToken: AuthTokenSource, userId: number): Promise<FollowersResponse> {
    const streamResponse = await twitchApiCall<FollowersResponse>({
        method: "GET",
        path: `/helix/channels/followers?broadcaster_id=${userId}`,
    }, authToken, true);

    return { total: streamResponse.total };
}

export async function createPoll(authToken: AuthTokenSource, broadcasterId: string, title: string, choices: string[], duration = 60): Promise<PollResponse> {
    const streamResponse = await twitchApiCall<JSONResponse<PollResponse>>({
        method: "POST",
        path: `/helix/polls`,
    }, authToken, true, {
        broadcaster_id: broadcasterId,
        title,
        choices: choices.map(choice => ({ title: choice })),
        duration,
    });
    return streamResponse.data[0];
}

export async function createPrediction(authToken: AuthTokenSource, broadcasterId: string, title: string, outcomes: string[], duration = 60): Promise<PredictionResponse> {
    const streamResponse = await twitchApiCall<JSONResponse<PredictionResponse>>({
        method: "POST",
        path: `/helix/predictions`,
    }, authToken, true, {
        broadcaster_id: broadcasterId,
        title,
        outcomes: outcomes.map(choice => ({ title: choice })),
        prediction_window: duration,
    });
    if (streamResponse.data[0]) {
        return streamResponse.data[0];
    }
    throw new Error("Didn't set up a poll for some reason");
}

export async function eventSub<Condition extends EventSub<any>>(authToken: AuthTokenSource, payload: Condition) {
    const streamResponse = await twitchApiCall<EventSubResponse | EventSubError>({
        method: "POST",
        path: `/helix/eventsub/subscriptions`,
    }, authToken, true, payload);
    if (isEventSubError(streamResponse)) {
        throw new Error(`${streamResponse.status}: ${streamResponse.error} - ${streamResponse.message}`);
    } else {
        twitchLog.info(`Subscribed to ${green(payload.type)}`);
        return streamResponse;
    }
}

export async function eventUnsub(authToken: AuthTokenSource, id: string) {
    const streamResponse = await twitchApiCall<string>({
        method: "DELETE",
        path: `/helix/eventsub/subscriptions?id=${id}`,
    }, authToken, false);
    twitchLog.info(`Unsubscribed from ${green(id)}`);
}