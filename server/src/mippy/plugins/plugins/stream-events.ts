import { StreamEventWatcher } from "../../../data/stream-event-watcher";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import { MippyPlugin } from "../plugins";

export function streamEventsPlugin(authToken: UserAuthTokenSource, broadcasterId: string): MippyPlugin {
    return {
        name: "Stream Events",
        init: async mippy => {
            const eventWatcher = new StreamEventWatcher();
            if (broadcasterId) {
                eventWatcher.watch(authToken, broadcasterId, mippy);
            }

            return {}
        }
    }
}