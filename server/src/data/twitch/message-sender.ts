import { sendChatMessage } from "./api";
import { ChatSendResponse } from "./api/chat";
import { UserAuthTokenSource } from "./auth-tokens";

export type TwitchMessageSender = (text: string) => Promise<ChatSendResponse>;

export function twitchMessageSender(broadcasterId: string, botId: string, botToken: UserAuthTokenSource): TwitchMessageSender {
    return (text: string) => sendChatMessage(botToken, broadcasterId, botId, text);
}