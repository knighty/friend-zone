import { Observable, scan, shareReplay } from "rxjs";
import { Config } from "../config";
import { hotkey } from "../hotkeys";
const sound = require("sound-play");

export function focusFeed(config: Config) {
    return new Observable<boolean>(subscriber => {
        if (config.hotkeys.enabled) {
            return hotkey(config.hotkeys.focus).pipe(
                scan((a, c) => !a, false)
            ).subscribe(focus => {
                subscriber.next(focus);
                sound.play(`C:/windows/media/${focus ? "Speech On.wav" : "Speech Off.wav"}`);
            });
        }
    }).pipe(
        shareReplay(1)
    );
}