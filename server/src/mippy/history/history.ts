import OpenAI from "openai";
import { Subject } from "rxjs";
import { MippyHistoryMessage } from "./message";

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

    async addMessage(message: MippyHistoryMessage, summarizer: null | ((messages: MippyHistoryMessage[]) => Promise<string>)) {
        this.messages.push(message);
        if (summarizer != null && this.messages.length > this.maxMessages) {
            const summaryCount = Math.floor(this.maxMessages / 2);
            const summariseMessages = this.messages.slice(0, summaryCount);
            const summaryMessage = this.create("assistant", await summarizer(summariseMessages));
            this.summaries.push(summaryMessage);
            this.messages = this.messages.slice(summaryCount);
        }
        this.updated$.next(this);
    }

    createHistorySummarizer(client: OpenAI) {
        return async (messages: MippyHistoryMessage[]) => {
            const params: OpenAI.Chat.ChatCompletionCreateParams = {
                messages: [
                    ...messages,
                    this.create("user", "Summarise the important parts of the chat up until now in a few paragraphs"),
                ],
                model: "gpt-4o-mini",
            };
            const m = await client.chat.completions.create(params);
            return m.choices[0].message.content ?? "";
        };
    }
}
