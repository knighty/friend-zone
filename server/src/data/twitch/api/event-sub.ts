import { twitchLog, twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";
import { APICallError } from "./request";

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
    const response = await twitchRequest<EventSubResponse>({
        method: "POST",
        path: `/helix/eventsub/subscriptions`,
    }, authToken, payload);
    return response;
};

export async function eventUnsub(authToken: AuthTokenSource, id: string) {
    const response = await twitchRequest<never>({
        method: "DELETE",
        path: `/helix/eventsub/subscriptions`,
        params: { id },
        json: false
    }, authToken);
    return response;
};

export async function unsubscribeDisconnected(authToken: AuthTokenSource) {
    try {
        const response = await twitchRequest<EventSubListResponse>({
            method: "GET",
            path: "/helix/eventsub/subscriptions",
            params: {
                status: "websocket_disconnected"
            }
        }, authToken);
        for (let item of response.data) {
            await eventUnsub(authToken, item.id);
        }
    } catch (e) {
        if (e instanceof APICallError) {
            twitchLog.error(`${e.error.status}: ${e.error.error} - ${e.error.message}`);
        }
    }
};