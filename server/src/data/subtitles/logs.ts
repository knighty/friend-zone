import path from "path";
import Subtitles from "../subtitles";

type IgnoreWord = string;

type IgnoreWords = IgnoreWord[];

async function getIgnoreWords(): Promise<Set<string>> {
    const module = await import(`file://${path.join(__dirname, "ignore-words.json")}`, {
        assert: { type: 'json' }
    });
    const items = module.default as IgnoreWords;
    return new Set<string>(items);
}

type SubtitlesAnalysis = {
    mostSaidWords: {
        word: string,
        count: number,
    }[],
    userWordsSaid: {
        user: string,
        count: number
    }[]
}

function filterWord(word: string, ignoreWords: Set<string>) {
    if (word.length < 3)
        return true;
    if (ignoreWords.has(word))
        return true;
    return false;
}

type AnalysisOptions = {
    wordCounts: number,
}

export class SubtitlesLog {
    logs: Record<string, string[]> = {};

    constructor(subtitles: Subtitles) {
        subtitles.observeFinalMessages().subscribe(message => {
            this.addMessage(message.userId, message.text);
        })
    }

    addMessage(user: string, message: string) {
        if (!this.logs[user])
            this.logs[user] = [];

        this.logs[user].push(message);
    }

    async analyzeLogs(options?: AnalysisOptions): Promise<SubtitlesAnalysis> {
        const ignoreWords = await getIgnoreWords();

        const wordCounts: Record<string, number> = {};
        const userWordsSaid: Record<string, number> = {};
        for (let user in this.logs) {
            const log = this.logs[user];
            userWordsSaid[user] = 0;
            for (let message of log) {
                const nonPossessived = message.replaceAll(/\'s/g, "");
                const f = nonPossessived.replaceAll(/\-s/g, " ");
                const words = f.toLowerCase().split(" ");
                userWordsSaid[user] += words.length;
                for (let word of words) {
                    word = word.replaceAll(/[^a-z]/g, "");
                    if (filterWord(word, ignoreWords))
                        continue;
                    wordCounts[word] = (wordCounts[word] ?? 0) + 1;
                }
            }
        }
        const mostSaidWords = Object.entries(wordCounts).sort(([akey, avalue], [bkey, bvalue]) => bvalue - avalue).slice(0, options?.wordCounts ?? 10);

        return {
            mostSaidWords: mostSaidWords.map(([key, value]) => ({ word: key, count: value })),
            userWordsSaid: Object.entries(userWordsSaid).map(([key, value]) => ({ user: key, count: value })),
        }
    }
}