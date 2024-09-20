import { Observable } from "rxjs"

export type Embed = {
    loaded: Observable<any>,
    hasAudio: boolean,
    toggleAudio: (allowed: boolean) => void,
    unload?: () => any,
}

export type EmbedHandler = (url: string, element: HTMLElement) => boolean | Embed