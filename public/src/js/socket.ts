import { connectBrowserSocket } from "shared/websocket/browser";
import { ObservableEventProvider } from "shared/websocket/event-provider";

export const socket = connectBrowserSocket<{
    Events: {
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
        feedLayout: "row" | "column"
    }
}>(document.body.dataset.socketUrl, new ObservableEventProvider({}));