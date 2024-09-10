import { spawn } from "node:child_process";
import path from "node:path";
import { distinctUntilChanged, EMPTY, filter, map, merge, startWith, Subject, switchMap } from "rxjs";

const gkm = spawn('java', ['-jar', path.join(__dirname, 'lib/gkm.jar')]);

const rawKeyEvents$ = new Subject<string>();

gkm.stdout.on('data', function (message: string) {
    const data = message.toString().split(/\r\n|\r|\n/).filter(function (item) { return item; });
    for (var i in data) {
        rawKeyEvents$.next(data[i]);
    }
});

const keyEvents$ = rawKeyEvents$.pipe(
    map((data: string) => {
        const parts = data.split(":");
        return {
            type: parts[0],
            data: parts[1]
        }
    })
);

export function keyEvent(e: string) {
    return keyEvents$.pipe(
        filter(event => event.type == e)
    );
}

export function pressed(key: string) {
    return keyEvent("key.pressed").pipe(
        filter(e => e.data == key)
    );
}

export function released(key: string) {
    return keyEvent("key.released").pipe(
        filter(e => e.data == key)
    );
}

export function held(key: string) {
    return merge(
        pressed(key).pipe(map(e => true)),
        released(key).pipe(map(e => false))
    ).pipe(
        startWith(false),
        distinctUntilChanged(),
    );
}

export function hotkey(hotkeys: string[]) {
    let hotkey$ = held(hotkeys[0]);
    for (let hotkey of hotkeys.slice(1)) {
        hotkey$ = hotkey$.pipe(
            switchMap(e => e ? held(hotkey) : EMPTY)
        )
    }
    return hotkey$.pipe(filter(v => v));
}