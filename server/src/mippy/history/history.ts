import OpenAI from "openai";
import { Subject } from "rxjs";
import { MippyHistoryMessage, MippyHistoryMessageAssistant, MippyHistoryMessageTool } from "./message";

export class MippyHistory {
    updated$ = new Subject<MippyHistory>();
    maxMessages = 100;
    summaries: MippyHistoryMessage[] = [];
    messages: MippyHistoryMessage[] = [];

    create<Role extends "user" | "assistant" | "system">(role: Role, content: string, name?: string, images?: string[]): MippyHistoryMessage {
        switch (role) {
            case "user": {
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

            case "system": {
                return {
                    role: "system",
                    name: name,
                    content: content
                };
            }

            case "assistant": {
                return {
                    role: "assistant",
                    name: name,
                    content: content
                };
            }
        }

        throw new Error("Invalid role provided");
    }

    createToolResponse(content: string, toolCallId: string): MippyHistoryMessageTool {
        return {
            role: "tool",
            tool_call_id: toolCallId,
            content: content
        };
    }

    addMessage(message: MippyHistoryMessage) {
        this.messages.push(message);
        this.updated$.next(this);
    }

    async summarize(summarizer: null | ((messages: MippyHistoryMessage[]) => Promise<string>)) {
        if (summarizer != null && this.messages.length > this.maxMessages) {
            const summaryCount = Math.floor(this.maxMessages / 2);

            // Get the first summaryCount messages
            let summariseMessages = this.messages.slice(0, summaryCount);

            // Find the last assistant message that was a tool call
            const lastToolCall = summariseMessages.findLast(message => message.role == "assistant" && message.tool_calls !== undefined);

            // Find the last index of a tool response for that tool call
            if (lastToolCall) {
                const maxId = ((lastToolCall as MippyHistoryMessageAssistant).tool_calls?.reduce((max, call) => {
                    const index = this.messages.findIndex(message => message.role == "tool" && message.tool_call_id == call.id);
                    return Math.max(index, max);
                }, 0) ?? 0) + 1;

                // If the last tool usage was greater than the length of the summarise array then we need to extend it
                if (maxId > summariseMessages.length) {
                    summariseMessages = this.messages.slice(0, maxId);
                }
            }

            // Summarise and trim the array
            const summaryMessage = this.create("assistant", await summarizer(summariseMessages));
            this.summaries.push(summaryMessage);
            this.messages = this.messages.slice(summariseMessages.length);
        }
    }

    createHistorySummarizer(client: OpenAI) {
        return async (messages: MippyHistoryMessage[]) => {
            const params: OpenAI.Chat.ChatCompletionCreateParams = {
                messages: [
                    ...messages,
                    this.create("user", "Summarise a factual list of the important parts of the chat up until now as succinctly as possible"),
                ],
                model: "gpt-4o-mini",
            };
            const m = await client.chat.completions.create(params);
            return m.choices[0].message.content ?? "";
        };
    }
}
