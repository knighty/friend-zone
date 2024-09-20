import { map, startWith, Subject } from "rxjs";
import { logger } from "shared/logger";
import { TwitchChat } from "./twitch-chat";

const log = logger("woth");

export class WordOfTheHour {
    word: string | null = null;
    counts = new Map<string, number>();
    update$ = new Subject<void>();

    constructor(twitchChat: TwitchChat) {
        twitchChat.observeCommand("woth").subscribe(command => {
            const name = command.arguments[0].toLowerCase();
            switch (name) {
                case "reset": {
                    this.reset();
                } break;
                case "set": {
                    this.setWord(command.arguments[1] ?? null);
                } break;
                default: {
                    const count = Number(command.arguments[1]);
                    if (!isNaN(count)) {
                        this.setUserCount(name, count);
                    } else {
                        this.incrementUserCount(name);
                    }
                }
            }
        });
    }

    observe() {
        return this.update$.pipe(
            startWith(null),
            map(() => ({
                word: this.word,
                counts: Object.fromEntries(this.counts)
            }))
        );
    }

    setWord(word: string | null) {
        this.word = word;
        log.info(`Set to "${this.word}"`);
        this.update$.next();
    }

    incrementUserCount(user: string) {
        const count = this.counts.get(user) || 0;
        this.counts.set(user, count + 1);
        log.info(`Set ${user} to "${count + 1}"`);
        this.update$.next();
    }

    setUserCount(user: string, count: number) {
        log.info(`Set ${user} to "${Number(count)}"`);
        this.counts.set(user, Number(count));
        this.update$.next();
    }

    reset() {
        const newMap = new Map<string, number>();
        for (let key in this.counts) {
            newMap.set(key, 0);
        }
        this.counts = newMap;
        log.info(`Reset all counts`);
        this.update$.next();
    }
}