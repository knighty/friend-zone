import OpenAI from "openai";
import { Subject } from "rxjs";
import { MippyHistoryMessage } from "./message";

export class MippyHistory {
    updated$ = new Subject<MippyHistory>();
    maxMessages = 100;
    summaries: MippyHistoryMessage[] = [];
    messages: MippyHistoryMessage[] = [];

    create<Role extends "user" | "assistant" | "system">(role: Role, content: string, name?: string): MippyHistoryMessage {
        if (role == "user") {
            return { role, content, date: Date.now(), name };
        } else {
            return { role, content, date: Date.now() };
        }
    }

    async addMessage(message: MippyHistoryMessage, summarizer: (messages: MippyHistoryMessage[]) => Promise<string>) {
        this.messages.push(message);
        if (this.messages.length > this.maxMessages) {
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
