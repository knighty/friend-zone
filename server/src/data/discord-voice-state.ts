import RPC from "discord-rpc";
import { interval, map, merge, Observable, scan, shareReplay, Subject } from "rxjs";
import { Person } from "./users";

type DiscordUser = string;
type SpeakingMap = Map<DiscordUser, boolean>;

//channel "407280611469033482"
export default class DiscordVoiceState {
    speaking$: Observable<SpeakingMap>;
    startSpeaking$ = new Subject<{ channel_id: string, user_id: string }>();
    stopSpeaking$ = new Subject<{ channel_id: string, user_id: string }>();

    constructor() {
        this.speaking$ = merge(
            this.startSpeaking$.pipe(map(e => (speakers: SpeakingMap) => speakers.set(e.user_id, true))),
            this.stopSpeaking$.pipe(map(e => (speakers: SpeakingMap) => speakers.delete(e.user_id)))
        ).pipe(
            scan((a, c) => (c(a), a), new Map<DiscordUser, boolean>()),
            shareReplay(1),
        )
    }

    mock(users: Map<string, Person>) {
        interval(500).subscribe(e => {
            const keys = Array.from(users.keys());
            const key = keys[Math.floor(keys.length * Math.random())];
            if (Math.random() > 0.5) {
                this.startSpeaking$.next({ channel_id: "rgergeg", user_id: users.get(key).discordId });
            } else {
                this.stopSpeaking$.next({ channel_id: "rgergeg", user_id: users.get(key).discordId });
            }
        });
    }

    connectToRpc(channelId: string) {
        const client = new RPC.Client({ transport: 'ipc' });

        client.on('ready', () => {
            console.log(client.user);
            console.log('Authed for user', client.user.username);

            client.subscribe("SPEAKING_START", { channel_id: channelId });
            client.subscribe("SPEAKING_STOP", { channel_id: channelId });
            client.subscribe("MESSAGE_CREATE", { channel_id: channelId });
            client.on("MESSAGE_CREATE", e => console.log(e));
            client.on("SPEAKING_START", e => this.startSpeaking$.next(e));
            client.on("SPEAKING_STOP", e => this.stopSpeaking$.next(e));
        });

        // Log in to RPC with client id
        client.login({
            clientId: '1282680646573097002',
            clientSecret: 'EdF05JayGOQAJSAuDOTTAfzB2cDpFqEQ',
            redirectUri: 'http://localhost:3000/api/auth/callback/discord',
            scopes: ['rpc']
        });

    }
}

