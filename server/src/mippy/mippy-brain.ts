import { ChatCompletionMessageToolCall } from "openai/resources/index.mjs";
import { Observable } from "rxjs";
import { MippyPartialResult } from "./chat-gpt-brain";

export interface MippyBrain {
    receive(): Observable<MippyMessage>;
    receivePartials(): Observable<Observable<MippyPartialResult>>;
    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, prompt: Omit<Prompt, "text">): void;
}

export type Prompt = {
    text: string,
    source?: "chat" | "admin",
    name?: string,
    store?: boolean,
    allowTools?: boolean
}

export type PartialPrompt = Omit<Prompt, "text">;

export type MippyMessage = {
    text: string;
    prompt: Prompt;
    tool?: Array<ChatCompletionMessageToolCall>,
}

export type MippyPrompts = {
    wothSetCount: { count: number, word: string, user: string },
    wothSetWord: { word: string, user: string },
    question: { question: string, user: string },
    setCategory: { category: string },
    newFollower: { user: string },
    newSubscriber: { user: string },
    adBreak: { duration: number },
    setEmojiOnly: { emojiOnly: boolean },
    askMippy: { user: string, question: string },
    pollEnd: { title: string, won: string, votes: number },
    predictionEnd: { title: string, data: string },
    highlightedMessage: { user: string, message: string }
}