import { connectable, filter, fromEvent, map, scan, share, shareReplay, Subject, takeUntil, withLatestFrom } from "rxjs";
import { renderLoop$ } from "shared/rx/render-loop";
import { createElement } from "shared/utils";
import { EmbedHandler } from "./embed-handler";

export const vdoNinjaHandler: EmbedHandler = (url: string, element: HTMLElement) => {
    const urlObj = new URL(url);
    if (urlObj.hostname == "vdo.ninja") {
        const params: Record<string, any> = {
            bitrate: 5000,
            codec: "h264",
            speakermute: true,
            ...Object.fromEntries(urlObj.searchParams.entries()),
        }
        for (let key in params) {
            urlObj.searchParams.set(key, params[key].toString());
        }
        const iframe = document.createElement("iframe");
        iframe.src = urlObj.href;
        iframe.allow = "autoplay;";
        element.appendChild(iframe);
        element.appendChild(createElement("div", { classes: ["volume-indicator"] }));

        const unloaded$ = new Subject<void>();

        const messages$ = fromEvent<MessageEvent>(window, "message").pipe(
            filter(e => e.source == iframe.contentWindow),
            share()
        );

        const loudness$ = messages$.pipe(
            filter(e => e.data.action == "loudness"),
            takeUntil(unloaded$),
            map(e => e.data.value as number),
            share()
        )

        loudness$.subscribe(loudness => element.style.setProperty("--loudness", loudness.toString()));

        const loaded$ = connectable(messages$.pipe(
            filter(e => e.data.action == "video-element-created"),
            takeUntil(unloaded$),
            shareReplay(1),
        ));
        loaded$.connect();

        renderLoop$.pipe(
            withLatestFrom(loudness$),
            scan((smoothed, [i, loudness]) => Math.max(smoothed * 0.99, loudness), 0),
            takeUntil(unloaded$),
        ).subscribe(smoothed => element.style.setProperty("--smoothed-loudness", smoothed.toString()));

        return {
            hasAudio: true,
            toggleAudio(allowed: boolean) {
                setTimeout(() => {
                    iframe.contentWindow.postMessage({
                        "mute": !allowed
                    }, '*');
                    iframe.contentWindow.postMessage({
                        "getLoudness": allowed
                    }, '*');
                }, 500)
            },
            loaded: loaded$,
            unload: () => unloaded$.next()
        };
    }
    return false;
}