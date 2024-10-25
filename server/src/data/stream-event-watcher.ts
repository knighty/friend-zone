import { defer, EMPTY, map } from "rxjs";
import { UserAuthTokenSource } from "./twitch/auth-tokens";
import { Events } from "./twitch/event-sub/events";
import { twitchSocket } from "./twitch/socket";

const enabled = true;
export class StreamEventWatcher {
    authToken: UserAuthTokenSource;
    twitchSocket: ReturnType<typeof twitchSocket> | null = null;

    constructor(authToken: UserAuthTokenSource) {
        this.authToken = authToken;
    }

    onEvent<E extends keyof Events>(event: E, condition: Events[E]["condition"], version: string = "1") {
        if (!enabled) {
            return EMPTY;
        }

        return defer(() => {
            if (this.twitchSocket == null) {
                this.twitchSocket = twitchSocket(this.authToken);
            }

            return this.twitchSocket.on<{ event: Events[E]["event"] }, Events[E]["condition"]>(event, condition, version).pipe(
                map(e => e.event)
            );
        });
    }
}