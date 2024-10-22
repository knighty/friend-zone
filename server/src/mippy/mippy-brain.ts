import { ChatCompletionMessageToolCall } from "openai/resources/index.mjs";
import { Observable } from "rxjs";
import { MippyPartialResult } from "./chat-gpt-brain";

export interface MippyBrain {
    receive(): Observable<MippyMessage>;
    receivePartials(): Observable<Observable<MippyPartialResult>>;
    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, prompt: Omit<Prompt, "text">): void;
}

type BasePrompt = {
    text: string,
    source?: "chat" | "admin",
    store?: boolean,
    allowTools?: boolean,
    image?: string[],
    history?: boolean
}

type UserPrompt = BasePrompt & {
    role?: "user",
    image?: string[],
    name?: string,
}

type SystemPrompt = BasePrompt & {
    role: "system"
}

export type Prompt = UserPrompt | SystemPrompt;

export function isUserPrompt(prompt: Prompt): prompt is UserPrompt {
    return prompt.role == "user" || prompt.role === undefined
}

export type PartialPrompt = Omit<UserPrompt, "text"> | Omit<SystemPrompt, "text">;

export type MippyMessage = {
    text: string;
    prompt: Prompt;
    tool?: Array<ChatCompletionMessageToolCall>,
}

export type MippyPrompts = {
    generic: {},
    wothSetCount: { count: number, word: string, user: string },
    wothSetWord: { word: string, user: string },
    question: { question: string, user: string },
    setCategory: { category: string, viewers: string },
    newFollower: { user: string },
    newSubscriber: { user: string },
    cheer: { user: string, bits: string, message: string },
    resubscribe: { user: string, months: string, message: string },
    adBreak: { duration: number },
    setEmojiOnly: { emojiOnly: boolean },
    askMippy: { user: string, question: string },
    pollEnd: { title: string, won: string, votes: number },
    predictionEnd: { title: string, data: string },
    highlightedMessage: { user: string, message: string, logs: string },
    subtitlesAnalysis: { mostSaidWords: string, userWordsSaid: string },
    suggestWordOfTheHour: { mostSaidWords: string },
    scheduleAnnounce: { schedule: string },
    sayGoodbye: { schedule: string },
    sayHi: { user: string, info: string }
}