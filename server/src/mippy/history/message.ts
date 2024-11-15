import { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionToolMessageParam, ChatCompletionUserMessageParam } from "openai/resources/index.mjs";

export type MippyHistoryMessageUser = ChatCompletionUserMessageParam;

export type MippyHistoryMessageAssistant = ChatCompletionAssistantMessageParam;

export type MippyHistoryMessageSystem = ChatCompletionSystemMessageParam;

export type MippyHistoryMessageTool = ChatCompletionToolMessageParam;

export type MippyHistoryMessage = MippyHistoryMessageUser | MippyHistoryMessageAssistant | MippyHistoryMessageSystem | MippyHistoryMessageTool;

export function createUserMessage(content: string, name?: string, images?: string[]): MippyHistoryMessageUser {
    return {
        role: "user",
        name: name,
        content: images ? [
            {
                type: "text",
                text: content
            },
            ...images.map(image => ({
                image_url: {
                    url: image,
                    detail: "low"
                },
                type: 'image_url'
            } as const))
        ] : content
    };
}

export function createAssistantMessage(content: string): MippyHistoryMessageAssistant {
    return {
        role: "assistant",
        content: content
    };
}

export function createSystemMessage(content: string): MippyHistoryMessageSystem {
    return {
        role: "system",
        content: content
    };
}

export function createToolMessage(content: string, toolCallId: string): MippyHistoryMessageTool {
    return {
        role: "tool",
        tool_call_id: toolCallId,
        content: content
    };
}