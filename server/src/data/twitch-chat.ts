import { filter, Observable, share, shareReplay, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { filterMap } from "shared/rx/utils";
import tmi from "tmi.js";
import config from "../config";

const log = logger("twitch-chat");

type Message = {
    user: string,
    text: string
}

type Command = {
    type: string,
    arguments: any[]
}

export class TwitchChat {
    private messages$: Observable<Message>;
    private commands$: Observable<Command>;
    private client$: Observable<tmi.Client>;

    constructor(twitchChannel: string) {
        function isUserAdmin(name: string): boolean {
            const regex = new RegExp(`^(${config.auth.admins.join("|")})$`);
            const isAdmin = !!name.toLowerCase().match(regex);
            return isAdmin;
        }

        this.client$ = new Observable<tmi.Client>(subscriber => {
            const client = new tmi.Client({
                connection: {
                    secure: true,
                    reconnect: true
                },
                channels: [twitchChannel]
            });
            subscriber.next(client);
            client.on("connecting", e => {
                log.info(`Connecting IRC client to "${twitchChannel}"...`);
            });
            client.on("connected", e => {
                log.info(`IRC client connected to "${twitchChannel}"`);
            });
            client.connect();
        }).pipe(
            shareReplay(1)
        );

        this.messages$ = this.client$.pipe(
            switchMap(client => {
                return new Observable<{ user: string, text: string }>(subscriber => {
                    const fn = (channel: string, tags: any, message: any) => {
                        const chatName = tags['display-name'];
                        subscriber.next({
                            user: chatName,
                            text: message
                        });
                    }
                    client.on("message", fn);
                });
            }),
            share()
        );

        this.commands$ = this.messages$.pipe(
            filterMap(
                message => message.text.startsWith("!") && isUserAdmin(message.user),
                message => {
                    const args = message.text.slice(1).split(' ');
                    const command = args[0];
                    return {
                        type: command,
                        arguments: args.slice(1),
                    }
                }
            ),
            share()
        )
    }

    observeCommand(type: string) {
        log.info(`Watching for "!${type}" in Twitch chat`);
        return this.commands$.pipe(
            filter(command => command.type == type),
            share()
        );
    }

    observeMessages() {
        return this.messages$;
    }
}