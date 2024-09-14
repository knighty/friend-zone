import RPC, { RPCEvents } from "discord-rpc";
import { map, merge, Observable, scan, shareReplay, Subject, switchMap, tap } from "rxjs";
import config from "../config";
import { logger } from "../lib/logger";

type DiscordUser = string;
type SpeakingMap = Map<DiscordUser, boolean>;
const log = logger("discord-voice-status");

const client$ = (new Observable<RPC.Client>(subscriber => {
    log.info(`Init RPC client`);
    const client = new RPC.Client({ transport: 'ipc' });
    client.on('ready', () => {
        log.info(`RPC client ready`);
        subscriber.next(client);
    });
    client.login({
        clientId: config.discord.clientId,
        clientSecret: config.discord.clientSecret,
        redirectUri: config.discord.redirectUri,
        scopes: ['rpc']
    });
    return () => client.destroy();
})).pipe(shareReplay(1))

namespace Events {
    export type Speaking = { channel_id: string, user_id: string };

    export type Message = {
        message: {
            nick: string,
            content: string
        }
    };
}

export default class DiscordVoiceState {
    speaking$: Observable<SpeakingMap>;
    startSpeaking$ = new Subject<string>();
    stopSpeaking$ = new Subject<string>();

    constructor() {
        this.speaking$ = merge(
            this.startSpeaking$.pipe(map(userId => (speakers: SpeakingMap) => speakers.set(userId, true))),
            this.stopSpeaking$.pipe(map(userId => (speakers: SpeakingMap) => speakers.delete(userId)))
        ).pipe(
            scan((a, c) => (c(a), a), new Map<DiscordUser, boolean>()),
            shareReplay(1),
        )
    }

    connectToChannel(channelId: string) {
        function watch<T>(event: RPCEvents, data: any) {
            return client$.pipe(
                switchMap(client => {
                    return new Observable<T>(subscriber => {
                        log.info(`Subscribed to ${event} in channel "${channelId}"`);
                        const fn = (e: T) => subscriber.next(e)
                        const subscription = client.subscribe(event, data as T);
                        client.on(event, fn);
                        return () => {
                            client.off(event, fn);
                            log.info(`Unsubscribed from ${event} in channel "${channelId}"`);
                            subscription.then(subscription => subscription.unsubscribe());
                        }
                    });
                })
            )
        }

        return merge(
            watch<Events.Speaking>("SPEAKING_START", { channel_id: channelId }).pipe(
                tap(e => this.startSpeaking$.next(e.user_id))
            ),
            watch<Events.Speaking>("SPEAKING_STOP", { channel_id: channelId }).pipe(
                tap(e => this.stopSpeaking$.next(e.user_id))
            ),
            watch<Events.Message>("MESSAGE_CREATE", { channel_id: channelId }).pipe(
                tap((e: any) => log.info(`[${e.message.nick}] ${e.message.content}`))
            ),
        ).subscribe({
            error: error => log.error(error)
        });
    }
}

