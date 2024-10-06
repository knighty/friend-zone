import { BehaviorSubject, combineLatest, EMPTY, filter, map, Observable, Subject, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { ObservableMap } from "shared/rx/observables/map";
import { Mippy } from "../mippy/mippy";
import TwitchChat from "./twitch-chat";

const log = logger("woth");

type Subtitle = {
    subtitleId: number,
    userId: string,
    text: string;
}

export default class WordOfTheHour {
    word$ = new BehaviorSubject<string | null>(null);
    counts = new ObservableMap<string, number>();
    subtitleWordEvent$ = new Subject<Subtitle>();
    mippy: Mippy;

    constructor(twitchChat: TwitchChat, mippy: Mippy) {
        this.mippy = mippy;

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

        function throttle() {
            const users: Record<string, number> = {};
            return (source: Observable<Subtitle>) => {
                return new Observable<Subtitle>(subscriber => {
                    source.subscribe({
                        next: value => {
                            const key = value.userId;
                            if (!(key in users) || value.subtitleId != users[key]) {
                                subscriber.next(value);
                                users[key] = value.subtitleId;
                            }
                        },
                        error: (error) => subscriber.error(error),
                        complete: () => subscriber.complete(),
                    })
                })
            }
        }

        this.subtitleWordEvent$.pipe(
            //throttleGroup(subtitle => `${subtitle.userId}_${subtitle.subtitleId}`, 20000)
            throttle()
        ).subscribe(subtitle => {
            this.handleUser(subtitle.userId);
        });
    }

    handleUser(user: string) {
        this.incrementUserCount(user);
    }

    observe() {
        return combineLatest([this.word$, this.counts.entries$]).pipe(
            map(([word, counts]) => ({ word, counts }))
        );
    }

    setWord(word: string | null) {
        this.word$.next(word);
        log.info(`Set to "${word}"`);
        if (word != null)
            this.mippy.ask("wothSetWord", { user: "", word });
    }

    incrementUserCount(user: string) {
        const count = this.counts.atomicSet(user, value => value + 1, 0);
        log.info(`Set ${user} to ${count}`);
        this.mippy.ask("wothSetCount", { user: user, count, word: this.word$.getValue() });
    }

    setUserCount(user: string, count: number) {
        log.info(`Set ${user} to ${count}`);
        this.counts.set(user, count);
    }

    reset() {
        this.counts.empty();
        log.info(`Reset all counts`);
    }

    hookSubtitles(subtitles$: Observable<Subtitle>) {
        this.word$.pipe(
            switchMap(word => {
                if (word == null) {
                    return EMPTY
                }
                word = word.toLowerCase();
                return subtitles$.pipe(
                    filter(subtitle => subtitle.text.toLowerCase().includes(word))
                )
            })
        ).subscribe(subtitle => {
            this.subtitleWordEvent$.next(subtitle);
        })
    }
}