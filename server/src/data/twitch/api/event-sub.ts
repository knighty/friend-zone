import { green } from "kolorist";
import { twitchLog, twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";

export type EventSubResponse = {
    error: undefined;
    data: {
        id: string;
        status: string;
        type: string;
        version: string;
        cost: number;
        condition: any;
        transport: {
            method: string;
            callback?: string;
        };
        created_at: string;
    }[];
    total: number;
    total_cost: number;
    max_total_cost: number;
};

export type EventSubError = {
    error: string;
    status: number;
    message: string;
};

export type EventSubListResponseItem = {
    id: string;
    status: string;
    type: string;
    version: string;
    cost: number;
    condition: any;
    created_at: string;
    transport: {
        method: "webhook" | "websocket";
    };
};

export type EventSubListResponse = {
    data: EventSubListResponseItem[];
    total: number;
    total_cost: number;
    max_total_cost: number;
    pagination: {};
};

export function isEventSubError(response: EventSubResponse | EventSubError): response is EventSubError {
    return response.error != undefined;
};

export type EventSub<T = any> = {
    type: string;
    version: string;
    condition: T;
    transport: {
        method: "webhooks";
        callback: string;
    } | {
        method: "websocket";
        session_id: string;
    };
};

export async function eventSub<Condition extends EventSub<any>>(authToken: AuthTokenSource, payload: Condition) {
    const response = await twitchRequest<EventSubResponse | EventSubError>({
        method: "POST",
        path: `/helix/eventsub/subscriptions`,
    }, authToken, true, payload);
    if (isEventSubError(response)) {
        throw new Error(`${response.status}: ${response.error} - ${response.message}`);
    } else {
        twitchLog.info(`Subscribed to ${green(payload.type)}`);
        return response;
    }
};

export async function eventUnsub(authToken: AuthTokenSource, id: string) {
    const response = await twitchRequest<string>({
        method: "DELETE",
        path: `/helix/eventsub/subscriptions?id=${id}`,
    }, authToken, false);
    twitchLog.info(`Unsubscribed from ${green(id)}`);
    return response;
};

export async function unsubscribeDisconnected(authToken: AuthTokenSource) {
    const response = await twitchRequest<EventSubListResponse>({
        method: "GET",
        path: "/helix/eventsub/subscriptions?status=websocket_disconnected"
    }, authToken, true);
    for (let item of response.data) {
        await eventUnsub(authToken, item.id);
    }
};