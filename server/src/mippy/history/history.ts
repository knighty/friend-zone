import OpenAI from "openai";
import { Subject } from "rxjs";
import { log } from "shared/logger";
import { awaitResult } from "shared/utils";
import { createAssistantMessage, MippyHistoryMessage, MippyHistoryMessageAssistant } from "./message";

export function createHistorySummarizer(client: OpenAI) {
    return async (messages: MippyHistoryMessage[]) => {
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            messages: [
                ...messages,
                {
                    role: "user",
                    content: "Summarise a factual list of the important parts of the chat up until now as succinctly as possible"
                }
            ],
            model: "gpt-4o-mini",
        };
        const [error, m] = await awaitResult(client.chat.completions.create(params));
        if (error) {
            log.error(error);
            throw new Error("Error summarising messages", { cause: error });
        } else {
            return m.choices[0].message.content ?? "";
        }
    };
}

export class MippyHistory {
    updated$ = new Subject<MippyHistory>();
    maxMessages: number;
    summaries: MippyHistoryMessage[] = [];
    messages: MippyHistoryMessage[] = [];

    constructor(maxMessages: number = 100) {
        this.maxMessages = maxMessages;
    }

    addMessage(message: MippyHistoryMessage) {
        this.messages.push(message);
        this.updated$.next(this);
    }

    async summarize(summarizer: ((messages: MippyHistoryMessage[]) => Promise<string>)) {
        if (this.messages.length > this.maxMessages) {
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
            const [error, summary] = await awaitResult(summarizer(summariseMessages));
            if (!error) {
                const summaryMessage = createAssistantMessage(summary);
                this.summaries.push(summaryMessage);
                this.messages = this.messages.slice(summariseMessages.length);
            }
        }
    }
}
