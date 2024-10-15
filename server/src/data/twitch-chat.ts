import { green } from "kolorist";
import { filter, map, Observable, scan, share, shareReplay, startWith } from "rxjs";
import { logger } from "shared/logger";
import { filterMap, switchMapComplete } from "shared/rx";
import tmi from "tmi.js";
import config from "../config";

const log = logger("twitch-chat");

type Message = {
    user: string,
    text: string,
    highlighted: boolean
}

type Command = {
    user: string,
    type: string,
    arguments: any[]
}

export class TwitchChatLog {
    messages$: Observable<string[]>;

    constructor(twitchChat: TwitchChat) {
        this.messages$ = twitchChat.observeMessages().pipe(
            filter(message => message.user.toLowerCase() != "mippybot"),
            scan((state, message) => {
                state.push(`${message.user}: ${message.text}`);
                return state;
            }, [] as string[]),
            startWith([]),
            shareReplay(1),
        )
    }

    observeLastMessages(n: number) {
        return this.messages$.pipe(
            map(messages => messages.slice(-n))
        )
    }
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
                return new Observable<Message>(subscriber => {
                    const fn = (channel: string, tags: any, message: any) => {
                        const highlighted = tags['msg-id'] == 'highlighted-message';
                        const chatName = tags['display-name'];
                        subscriber.next({
                            user: chatName,
                            text: message,
                            highlighted
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
                        user: message.user,
                        type: command?.toLowerCase() ?? "",
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