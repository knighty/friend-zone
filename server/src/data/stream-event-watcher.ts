import { map } from "rxjs";
import { UserAuthTokenSource } from "./twitch/auth-tokens";
import { Events } from "./twitch/event-sub/events";
import { twitchSocket } from "./twitch/socket";

export class StreamEventWatcher {
    authToken: UserAuthTokenSource;
    twitchSocket: ReturnType<typeof twitchSocket>;

    constructor(authToken: UserAuthTokenSource) {
        this.authToken = authToken;
        this.twitchSocket = twitchSocket(authToken);
    }

    onEvent<E extends keyof Events>(event: E, condition: Events[E]["condition"], version: string = "1") {
        return this.twitchSocket.on<{ event: Events[E]["event"] }, Events[E]["condition"]>(event, condition, version).pipe(
            map(e => e.event)
        );
    }
}