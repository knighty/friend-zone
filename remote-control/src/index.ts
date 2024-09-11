import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import path from "node:path";
import { BehaviorSubject, EMPTY, firstValueFrom, fromEvent, ignoreElements, interval, map, merge, Observable, scan, shareReplay, switchMap, takeUntil, tap } from "rxjs";
import { log } from "../../server/src/lib/logger";
import { config } from "./config";
import { hotkey } from "./hotkeys";
import { initSocket } from "./socket";
const sound = require("sound-play");

declare module 'fastify' {
    interface FastifyRequest {
        dependencies: {
            [Key: string]: any
        }
    }
}

const publicDir = path.join(__dirname, "../");
const remoteControl = initSocket(config.socket, config.user);

hotkey(config.hotkeys.focus).pipe(
    scan((a, c) => !a, false)
).subscribe(focus => {
    console.log(`Focus: ${focus}`);
    remoteControl.feed(focus ? "focus" : "unfocus");
    sound.play(`C:/windows/media/${focus ? "Speech On.wav" : "Speech Off.wav"}`);
});
/*hotkey(config.hotkeys.endFocus).subscribe(() => {
    console.log("Focus mode disabled");
    remoteControl.feed("unfocus");
    sound.play("C:/windows/media/Speech Off.wav");
});*/

const fastifyApp = Fastify();
fastifyApp.register(fastifyView, {
    engine: {
        ejs: require("ejs"),
    },
    root: path.join(__dirname, 'views'),
    propertyName: 'view',
    asyncPropertyName: 'viewAsync',
    viewExt: 'ejs',
});
fastifyApp.register(websocket);

fastifyApp.register(fastifyStatic, {
    root: path.join(publicDir, '/dist'),
    constraints: {},
    cacheControl: true,
    maxAge: 3600 * 1000,
    prefix: "/static",
});

function dynamicConfig<T>(initial: T) {
    const subject$ = new BehaviorSubject<T>(initial);
    return [(value: T) => subject$.next(value), subject$] as const;
}

type Feed = {
    url: string,
    aspectRatio: string,
}

const [setFeed, feed$] = dynamicConfig<Feed | null>(null);
const [setFeedActive, feedActive$] = dynamicConfig(false);

remoteControl.isConnected$.pipe(
    switchMap(isConnected => {
        if (isConnected) {
            return merge(
                feed$.pipe(tap(feed => remoteControl.feed("register", feed))),
                feedActive$.pipe(tap(isActive => remoteControl.feed("active", { isActive })))
            );
        }
        return EMPTY
    })
).subscribe();

fastifyApp.register(async (fastify: FastifyInstance) => {
    fastify.get('/websocket', { websocket: true }, (socket, req) => {
        function send(type: string, data?: object | string) {
            socket.send(JSON.stringify({
                type,
                data
            }));
        }

        const ping$ = interval(30 * 1000).pipe(
            tap(i => socket.ping()),
        );

        socket.on('message', (event: any) => {
            try {
                const message = JSON.parse(event.toString());
                /*const message = JSON.parse(event.toString());
                remoteControl.subtitles(message.id, message.type, message.text);
                //console.log(`[${message.id}] ${message.text} ${message.type == "final" ? "(final)" : ""}`);
                if (message.type == "final")
                    console.log(`[${message.id}] ${message.text}`);*/
                switch (message.type) {
                    case "config": {
                        console.log(`Set "${message.data.key}" to "${message.data.value}"`);
                        switch (message.data.key) {
                            case "feed": {
                                if (message.data.value.url != "") {
                                    setFeed({
                                        url: message.data.value.url,
                                        aspectRatio: message.data.value.aspectRatio,
                                    });
                                } else {
                                    setFeed(null);
                                }
                            } break;
                            case "feedActive": setFeedActive(message.data.value); break;
                        }
                    } break;
                }
            } catch (e) {

            }
        });

        const configMessages$ = merge(
            feed$.pipe(map(url => ({ key: "feedUrl", value: url }))),
            feedActive$.pipe(map(active => ({ key: "feedActive", value: active }))),
        ).pipe(
            tap(message => send("config", message))
        );

        const connectionStatus$ = remoteControl.isConnected$.pipe(
            tap(isConnected => {
                send("connectionStatus", { isConnected })
            })
        )

        merge(
            configMessages$,
            ping$,
            connectionStatus$
        ).pipe(
            ignoreElements(),
            takeUntil(fromEvent(socket, "close"))
        ).subscribe({
            complete: () => {
                log.info("Closing web socket", "websocket");
            }
        });
    })
});

type ManifestFile = { [Key: string]: string }
export const manifest$ = new Observable<ManifestFile>((subscriber) => {
    const filename = path.join(__dirname, "../dist/manifest.json");
    const update = () => {
        log.info("Static manifest file updated", "server");
        const manifest = JSON.parse(fs.readFileSync(filename).toString());
        subscriber.next(<ManifestFile>manifest);
    }
    update();
    fs.watchFile(filename, () => update());
}).pipe(
    shareReplay(1)
);

export function getManifestPath(path: string) {
    return firstValueFrom(manifest$.pipe(map(manifest => manifest[path])));
}

fastifyApp.get("/", async (req, rep) => {
    return rep.viewAsync("app", {
        style: await getManifestPath("main.css"),
        scripts: await getManifestPath("main.js"),
    })
});

const server = fastifyApp.listen({ port: 3010, host: "0.0.0.0" }, function (err, address) {
    console.log(`Running at http://localhost:${3010}`);
    if (err) {
        console.error(err.message);
        fastifyApp.log.error(err, "server")
        process.exit(1)
    }
});

/*const pythonProcess = child_process.spawn('python', [
    path.join(__dirname, "/../../whisper/transcribe_demo.py"),
    `--model=${config.whisper.model}`,
    `--phrase_timeout=${config.whisper.phrase_timeout}`,
    `--energy_threshold=${config.whisper.energy_threshold}`
]);
pythonProcess.stdout.on('data', (data: string) => {
    const subtitle = data.toString();
    console.log(subtitle);
    const split = subtitle.split(" ");
    if (split[0] == "subtitle") {
        const id = split[1];
        const text = split.slice(2).join(" ");
        remoteControl.subtitles(Number(id), "final", text);
    }
    //console.log(data.toString());
});
pythonProcess.stderr.on('data', (data: string) => {
    console.log(data.toString());
});*/
//pythonProcess.kill();