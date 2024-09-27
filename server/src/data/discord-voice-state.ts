import RPC, { RPCEvents } from "discord-rpc";
import { filter, merge, Observable, shareReplay, switchMap, tap } from "rxjs";
import { logger } from "shared/logger";
import { ObservableMap } from "shared/rx/observable-map";
import config from "../config";

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
        channel_id: string,
        message: {
            nick: string,
            content: string
        }
    };
}

export default class DiscordVoiceState {
    speaking: ObservableMap<DiscordUser, boolean> = new ObservableMap<DiscordUser, boolean>();

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
                tap(e => this.speaking.set(e.user_id, true))
            ),
            watch<Events.Speaking>("SPEAKING_STOP", { channel_id: channelId }).pipe(
                tap(e => this.speaking.delete(e.user_id))
            ),
            watch<Events.Message>("MESSAGE_CREATE", { channel_id: channelId }).pipe(
                filter(e => e.channel_id == channelId),
                tap((e: any) => log.info(`[${e.message.nick}] ${e.message.content}`))
            ),
        ).subscribe({
            error: error => log.error(error)
        });
    }
}

