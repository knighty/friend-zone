import fs from "fs/promises";
import { green } from "kolorist";
import { logger } from "shared/logger";
import { executionTimer } from "shared/utils";
import { MippyHistory } from "./history";
import { MippyHistoryMessage } from "./message";

const log = logger("mippy-history");

type HistorySchema = {
    summaries: MippyHistoryMessage[],
    messages: MippyHistoryMessage[],
}

export class MippyHistoryRepository {
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