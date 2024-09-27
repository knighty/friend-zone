import { BehaviorSubject, combineLatest, map } from "rxjs";
import { logger } from "shared/logger";
import { ObservableMap } from "shared/rx/observable-map";
import { TwitchChat } from "./twitch-chat";

const log = logger("woth");

export class WordOfTheHour {
    word$ = new BehaviorSubject<string | null>(null);
    counts = new ObservableMap<string, number>();

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
        return combineLatest([this.word$, this.counts.entries$]).pipe(
            map(([word, counts]) => ({ word, counts }))
        );
    }

    setWord(word: string | null) {
        this.word$.next(word);
        log.info(`Set to "${word}"`);
    }

    incrementUserCount(user: string) {
        const count = this.counts.atomicSet(user, value => value + 1, 0);
        log.info(`Set ${user} to ${count + 1}`);
    }

    setUserCount(user: string, count: number) {
        log.info(`Set ${user} to ${count}`);
        this.counts.set(user, count);
    }

    reset() {
        this.counts.empty();
        log.info(`Reset all counts`);
    }
}