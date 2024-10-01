import { Observable } from "rxjs";

export interface MippyBrain {
    receive(): Observable<MippyMessage>;
    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data): void;
}

export type Prompt = {
    text: string
}

export type MippyMessage = {
    text: string;
}

export type MippyPrompts = {
    wothSetCount: { count: number, word: string, user: string },
    wothSetWord: { word: string, user: string },
    question: { question: string },
    setCategory: { category: string },
    newFollower: { user: string },
    newSubscriber: { user: string },
    adBreak: { duration: number },
    setEmojiOnly: { emojiOnly: boolean },
}