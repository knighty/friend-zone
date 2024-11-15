import { debounceTime, EMPTY, of, shareReplay } from "rxjs";
import { switchMapComplete } from "shared/rx";
import { connectBrowserSocket } from "shared/websocket/browser";
import { ObservableEventProvider } from "shared/websocket/event-provider";

export namespace SocketData {
    export type Woth = {
        counts: Record<string, number>,
        word: string
    }

    export type Voice = Record<string, boolean>

    export type Subtitles = {
        subtitleId: number,
        text: string,
        userId: string
    }

    export type Users = Record<string, {
        id: string,
        name: string,
        discordId: string,
        sortKey: number
    }>

    export type Feed = {
        user: string,
        focused: string,
        active: boolean,
        url: string,
        aspectRatio: string,
        sourceAspectRatio: string,
    }[]

    export type FeedPosition = [number, number]

    export type FeedSize = number

    export type FeedCount = number

    export type FeedLayout = "row" | "column"

    export type MippySpeech = {
        id: string,
        audio: {
            duration: number,
        },
        message: {
            text: string
        },
    } | {
        id: string,
        finished: true
    }

    export type MippySpeechSkip = {
        id: string
    }

    export type MippyHistory = [
        string,
        {
            text: string,
            id: string,
            duration: number
        }
    ]

    export type Ticker = string
};

export const socket = connectBrowserSocket(document.body.dataset.socketUrl, new ObservableEventProvider({}));

export const socketData = {
    user$: socket.on<SocketData.Users>("users").pipe(shareReplay(1)),
    voice$: socket.on<SocketData.Voice>("voice").pipe(shareReplay(1)),
    woth$: socket.on<SocketData.Woth>("woth").pipe(shareReplay(1)),
    feed$: socket.on<SocketData.Feed>("feed").pipe(
        debounceTime(100),
        shareReplay(1),
    )
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
