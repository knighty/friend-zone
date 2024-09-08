import { Subject } from "rxjs";
import tmi from "tmi.js";
import { logger } from "../lib/logger";

type Person = {
    id: string;
    name: string;
    count: number;
}

function person(id: string, name?: string): Person {
    return {
        id: id.toLowerCase(),
        name: name ?? id,
        count: 0
    }
}

const log = logger("woth");
export class WordOfTheHour {
    people: Record<string, Person> = {
        phn: person("PHN"),
        knighty: person("knighty"),
        dan: person("Dan"),
        leth: person("Leth"),
    };
    word: string | null = null;
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
            return !!name.toLowerCase().match(/^(electricyoshi|knighty33|megadanxzero|phn|lethallin)$/);
        }

        client.on('message', (channel, tags, message, self) => {
            const chatName = tags['display-name'];

            const isAdmin = chatName && isUserAdmin(chatName);
            const isCommand = message.startsWith('!');
            console.log(`admin: ${isAdmin}, command: ${isCommand}`);

            if (isCommand && isAdmin) {
                const args = message.slice(1).split(' ');
                console.log(args);
                const command = args[0];
                switch (command) {
                    case "woth":
                        {
                            const name = args[1];
                            switch (name) {
                                case "reset": {
                                    for (let person in this.people) {
                                        this.people[person].count = 0;
                                    }
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
                                    const person = this.people[name];
                                    if (person) {
                                        if (!isNaN(amount)) {
                                            person.count = Number(amount);
                                        } else {
                                            person.count++;
                                        }
                                        log.info(`Set ${person.name} to "${person.count}"`);
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