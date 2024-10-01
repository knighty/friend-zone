import { green } from "kolorist";
import { filter, Observable, share, shareReplay } from "rxjs";
import { logger } from "shared/logger";
import filterMap from "shared/rx/operators/filter-map";
import { switchMapComplete } from "shared/rx/operators/switch-map-complete";
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

export default class TwitchChat {
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
                log.info(`Connecting IRC client to ${green(twitchChannel)}`);
            });
            client.on("connected", e => {
                log.info(`IRC client connected to ${green(twitchChannel)}`);
            });
            client.connect();
            client.on("disconnected", e => {
                subscriber.complete();
            });
        }).pipe(
            shareReplay(1)
        );

        this.messages$ = this.client$.pipe(
            switchMapComplete(client => {
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