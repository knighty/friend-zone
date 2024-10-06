import { ChatCompletionMessageToolCall } from "openai/resources/index.mjs";
import { Observable } from "rxjs";

export interface MippyBrain {
    receive(): Observable<MippyMessage>;
    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, source: string): void;
}

export type Prompt = {
    text: string,
    source: string,
}

export type MippyMessage = {
    text: string;
    prompt: string;
    tool?: Array<ChatCompletionMessageToolCall>,
    source: string,
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
    predictionEnd: { title: string, data: string }
}