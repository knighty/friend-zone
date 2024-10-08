import fs from "fs/promises";
import { green } from "kolorist";
import { Subject } from "rxjs";
import { logger } from "shared/logger";
import { executionTimer } from "shared/utils";

const log = logger("mippy-history");

export type MippyHistoryMessageUser = {
    role: "user",
    date: number,
    content: string,
    name?: string
}

export type MippyHistoryMessageAssistant = {
    content: string,
    date: number
    role: "assistant",
}

export type MippyHistoryMessage = MippyHistoryMessageUser | MippyHistoryMessageAssistant

type HistorySchema = {
    summaries: MippyHistoryMessage[],
    messages: MippyHistoryMessage[],
}

export class MippyHistory {
    updated$ = new Subject<MippyHistory>();
    maxMessages = 100;
    summaries: MippyHistoryMessage[] = [];
    messages: MippyHistoryMessage[] = [];

    create<Role extends "user" | "assistant">(role: Role, content: string, name?: string): MippyHistoryMessage {
        if (role == "user") {
            return { role, content, date: Date.now(), name }
        } else {
            return { role, content, date: Date.now() }
        }
    }

    async addMessage(message: MippyHistoryMessage, summarise: (messages: MippyHistoryMessage[]) => Promise<string>) {
        this.messages.push(message);
        if (this.messages.length > this.maxMessages) {
            const summaryCount = Math.floor(this.maxMessages / 2);
            const summariseMessages = this.messages.slice(0, summaryCount);
            const summaryMessage = this.create("assistant", await summarise(summariseMessages));
            this.summaries.push(summaryMessage);
            this.messages = this.messages.slice(summaryCount);
        }
        this.updated$.next(this);
    }
}

export class MippyMessageRepository {
    filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    async getHistory(): Promise<MippyHistory> {
        const history = new MippyHistory();
        try {
            const loadTimer = executionTimer();
            await fs.access(this.filePath);
            const fileContent = await fs.readFile(this.filePath);
            const json = <HistorySchema>JSON.parse(fileContent.toString());
            history.messages = json.messages;
            history.summaries = json.summaries;
            log.info(`Loaded ${green(history.messages.length)} messages and ${green(history.summaries.length)} summaries in ${green(loadTimer.end())}`);
        } catch (e: unknown) {
            log.info("Did not find Mippy history file");
        }
        return history;
    }

    async persistHistory(history: MippyHistory) {
        const fileContent: HistorySchema = {
            summaries: history.summaries,
            messages: history.messages
        }
        const saveTimer = executionTimer();
        const json = JSON.stringify(fileContent, null, 4);
        await fs.writeFile(this.filePath, json);
        log.info(`Persisted ${green(fileContent.messages.length)} messages and ${green(fileContent.summaries.length)} summaries in ${green(saveTimer.end())}`);
    }
}