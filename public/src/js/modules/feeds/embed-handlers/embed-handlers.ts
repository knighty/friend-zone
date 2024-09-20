import { of } from "rxjs";
import { Embed } from "./embed-handler";
import { vdoNinjaHandler } from "./vdo-ninja";
import { youtubeHandler } from "./youtube";

const simpleEmbed: Embed = {
    loaded: of(1),
    hasAudio: false,
    toggleAudio: allowed => null
}

export function handleEmbed(url: string, element: HTMLElement): Embed {
    for (const handler of embedHandlers) {
        const handled = handler(url, element);
        if (handled) {
            if (typeof handled == "boolean")
                return simpleEmbed;
            return handled;
        }
    }
    console.error("No handler found");
}

const embedHandlers: ((url: string, element: HTMLElement) => boolean | Embed)[] = [
    // Youtube
    youtubeHandler,
    vdoNinjaHandler,
    // Images
    (url: string, element: HTMLElement) => {
        const prefix = "image:";
        if (url.startsWith(prefix)) {
            element.innerHTML = `<img src="${url.substring(prefix.length)}"/>`
            return true;
        }
        return false;
    },
    (url: string, element: HTMLElement) => {
        return true;
    },
];