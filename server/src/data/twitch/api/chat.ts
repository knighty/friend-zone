import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

export type ChatSendResponse = {
    message_id: string;
    is_sent: boolean;
    drop_reason?: {
        code: string;
        message: string;
    };
};

export type ChatSettingsResponse = {
    broadcaster_id: string,
    slow_mode: boolean,
    slow_mode_wait_time: null,
    follower_mode: boolean,
    follower_mode_duration: number,
    subscriber_mode: boolean,
    emote_mode: boolean,
    unique_chat_mode: boolean,
    non_moderator_chat_delay: boolean,
    non_moderator_chat_delay_duration: number
}

const maxLength = 500;

export async function sendChatMessage(authToken: AuthTokenSource, broadcasterId: string, senderId: string, message: string): Promise<ChatSendResponse> {
    const response = await twitchRequest<JSONResponse<ChatSendResponse>>({
        method: "POST",
        path: `/helix/chat/messages`,
    }, authToken, {
        broadcaster_id: broadcasterId,
        sender_id: senderId,
        message: message.substring(0, maxLength)
    });
    if (response.data[0]) {
        const data = response.data[0];
        if (data.drop_reason) {
            throw new Error(`Message was not sent: ${data.drop_reason.message}`);
        }
        if (data.is_sent == false) {
            throw new Error("Message was not sent");
        }
        return data;
    }
    throw new Error("Failed to send message");
};

export async function getChatSettings(authToken: AuthTokenSource, broadcasterId: string): Promise<ChatSettingsResponse> {
    const response = await twitchRequest<JSONResponse<ChatSettingsResponse>>({
        method: "GET",
        path: `/helix/chat/settings`,
        params: {
            broadcaster_id: broadcasterId
        }
    }, authToken);
    if (response.data[0]) {
        const data = response.data[0];
        return data;
    }
    throw new Error("Failed to get chat settings");
};