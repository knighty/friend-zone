import { ChatCompletionAssistantMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from "openai/resources/index.mjs";

export type MippyHistoryMessageUser = ChatCompletionUserMessageParam;

export type MippyHistoryMessageAssistant = ChatCompletionAssistantMessageParam;

export type MippyHistoryMessageSystem = ChatCompletionSystemMessageParam;

export type MippyHistoryMessage = MippyHistoryMessageUser | MippyHistoryMessageAssistant | MippyHistoryMessageSystem;

