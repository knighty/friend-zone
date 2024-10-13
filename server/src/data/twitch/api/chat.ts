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

export async function sendChatMessage(authToken: AuthTokenSource, broadcasterId: string, senderId: string, message: string): Promise<ChatSendResponse> {
    const response = await twitchRequest<JSONResponse<ChatSendResponse>>({
        method: "POST",
        path: `/helix/chat/messages`,
    }, authToken, true, {
        broadcaster_id: broadcasterId,
        sender_id: senderId,
        message: message
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