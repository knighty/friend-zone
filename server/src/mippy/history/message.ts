export type MippyHistoryMessageUser = {
    role: "user";
    date: number;
    content: string;
    name?: string;
};

export type MippyHistoryMessageAssistant = {
    content: string;
    date: number;
    role: "assistant";
};

export type MippyHistoryMessage = MippyHistoryMessageUser | MippyHistoryMessageAssistant;

