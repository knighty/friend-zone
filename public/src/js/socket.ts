import { EMPTY, of, shareReplay } from "rxjs";
import { switchMapComplete } from "shared/rx/operators/switch-map-complete";
import { connectBrowserSocket } from "shared/websocket/browser";
import { ObservableEventProvider } from "shared/websocket/event-provider";

export type SocketEvents = {
    woth: {
        counts: Record<string, number>,
        word: string
    }
    voice: Record<string, boolean>
    subtitles: {
        subtitleId: number,
        text: string,
        userId: string
    }
    users: Record<string, {
        id: string,
        name: string,
        discordId: string,
        sortKey: number
    }>
    feed: {
        user: string,
        focused: string,
        active: boolean,
        url: string,
        aspectRatio: string,
        sourceAspectRatio: string,
    }[]
    feedPosition: [number, number]
    feedSize: number
    feedCount: number
    feedLayout: "row" | "column",
    mippySpeech: {
        id: string,
        audio: {
            duration: number,
            finished: boolean,
        },
        message: {
            text: string
            finished: boolean,
        },
    },
    mippyHistory: [
        string,
        {
            text: string,
            id: string,
            duration: number
        }
    ]
};

export const socket = connectBrowserSocket<{
    Events: SocketEvents
}>(document.body.dataset.socketUrl, new ObservableEventProvider({}));

export const socketData = {
    user$: socket.on("users").pipe(shareReplay(1)),
    voice$: socket.on("voice").pipe(shareReplay(1)),
    woth$: socket.on("woth").pipe(shareReplay(1)),
}

export function getUser(id: string) {
    return socketData.user$.pipe(
        switchMapComplete(users => {
            if (users[id]) {
                return of(users[id]);
            }
            return EMPTY
        })
    );
}
