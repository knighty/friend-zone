import { Subject } from "rxjs";
import tmi from "tmi.js";
import config from "../config";
import { logger } from "../lib/logger";

const log = logger("woth");
export class WordOfTheHour {
    word: string | null = null;
    counts = new Map<string, number>();
    update$ = new Subject<void>();

    constructor(twitchChannel: string) {
        const client = new tmi.Client({
            connection: {
                secure: true,
                reconnect: true
            },
            channels: [twitchChannel]
        });

        client.connect();

        function isUserAdmin(name: string): boolean {
            const regex = new RegExp(`^(${config.auth.admins.join("|")})$`);
            const isAdmin = !!name.toLowerCase().match(regex);
            return isAdmin;
        }

        client.on('message', (channel, tags, message, self) => {
            const chatName = tags['display-name'];

            const isAdmin = chatName && isUserAdmin(chatName);
            const isCommand = message.startsWith('!');

            if (isCommand && isAdmin) {
                const args = message.slice(1).split(' ');
                const command = args[0];
                switch (command) {
                    case "woth":
                        {
                            const name = args[1].toLowerCase();
                            switch (name) {
                                case "reset": {
                                    this.counts = new Map<string, number>();
                                    log.info(`Reset all counts"`);
                                    this.update$.next();
                                } break;

                                case "set": {
                                    this.word = args[2] ?? null;
                                    log.info(`Set to "${this.word}"`);
                                    this.update$.next();
                                } break;

                                default: {
                                    const amount = Number(args[2]);
                                    const count = this.counts.get(name) || 0;
                                    if (!isNaN(amount)) {
                                        this.counts.set(name, Number(amount));
                                        log.info(`Set ${name} to "${Number(amount)}"`);
                                    } else {
                                        this.counts.set(name, count + 1);
                                        log.info(`Set ${name} to "${count + 1}"`);
                                    }
                                    this.update$.next();
                                }
                            }
                        } break;
                }
            }
            console.log(`${tags['display-name']}: ${message}`);
        });
    }
}