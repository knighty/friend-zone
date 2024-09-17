import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import { green, yellow } from "ansi-colors";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import child_process from "node:child_process";
import path from "node:path";
import { BehaviorSubject, debounceTime, EMPTY, filter, firstValueFrom, map, merge, Observable, scan, shareReplay, switchMap, takeUntil, tap } from "rxjs";
import { serverSocket } from 'shared/websocket/server';
import { log, logger } from "../../server/src/lib/logger";
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
const remoteControl = initSocket(config.socket, config.user, config.userName, config.discordId);

function dynamicConfig<T>(initial: T) {
    const subject$ = new BehaviorSubject<T>(initial);
    return [(value: T) => subject$.next(value), subject$] as const;
}

type Feed = {
    url: string,
    aspectRatio: string,
    sourceAspectRatio: string,
}

const [setFeed, feed$] = dynamicConfig<Feed | null>(null);
const [setFeedActive, feedActive$] = dynamicConfig(false);

if (config.hotkeys.enabled) {
    hotkey(config.hotkeys.focus).pipe(
        scan((a, c) => !a, false)
    ).subscribe(focus => {
        remoteControl.feed(focus ? "focus" : "unfocus");
        sound.play(`C:/windows/media/${focus ? "Speech On.wav" : "Speech Off.wav"}`);
    });

}

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

remoteControl.isConnected$.pipe(
    debounceTime(500),
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

type SocketMessage<D> = {
    type: string,
    data: D;
}

const remoteControlLog = logger("remote-control");
fastifyApp.register(async (fastify: FastifyInstance) => {
    fastify.get('/websocket', { websocket: true }, (ws, req) => {
        const socket = serverSocket<{
            Events: {
                "config": { key: string, value: any }
            }
        }>(ws);

        function configMessage<ConfigValue>(config: string): Observable<ConfigValue> {
            return socket.receive("config").pipe(
                filter(message => message.key == config),
                map(message => message.value)
            )
        }

        const configSetters$ = merge(
            configMessage<{
                url: string,
                aspectRatio: string,
                sourceAspectRatio: string
            }>("feed").pipe(
                tap(feed => {
                    if (feed.url != "") {
                        setFeed({
                            url: feed.url,
                            aspectRatio: feed.aspectRatio,
                            sourceAspectRatio: feed.sourceAspectRatio,
                        });
                    } else {
                        setFeed(null);
                    }
                })
            ),

            configMessage<boolean>("feedActive").pipe(
                tap(active => {
                    setFeedActive(active);
                })
            )
        );

        socket.addEvent("config", merge(
            feed$.pipe(map(feed => ({ key: "feed", value: feed }))),
            feedActive$.pipe(map(active => ({ key: "feedActive", value: active }))),
        ));

        const connectionStatus$ = remoteControl.isConnected$.pipe(
            tap(isConnected => {
                socket.send("connectionStatus", { isConnected })
            })
        );

        merge(
            configSetters$,
            connectionStatus$
        ).pipe(
            takeUntil(socket.disconnected$)
        ).subscribe();
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

const subtitleLog = logger("subtitles");
if (config.subtitles == "whisper") {
    const pythonProcess = child_process.spawn('python', [
        path.join(__dirname, "/../../whisper/transcribe_demo.py"),
        `--model=${config.whisper.model}`,
        `--phrase_timeout=${config.whisper.phrase_timeout}`,
        `--energy_threshold=${config.whisper.energy_threshold}`,
        `--min_probability=${config.whisper.min_probability}`
    ]);
    pythonProcess.stdout.on('data', (data: string) => {
        const lines = data.toString().split(/[\r\n]/g);
        for (let subtitle of lines) {
            if (subtitle == "")
                continue;
            const split = subtitle.split(" ");
            if (split[0] == "subtitle") {
                const id = split[1];
                const json = split.slice(2).join(" ").trim();
                const segments = JSON.parse(json) as {
                    text: string,
                    probability: number
                }[];
                const text = segments
                    .filter(segment => segment.probability < config.whisper.min_probability)
                    .map(segment => segment.text)
                    .join("")
                    .trim();
                const ignored = segments
                    .filter(segment => segment.probability >= config.whisper.min_probability)
                    .map(segment => `${segment.text} (${Math.floor(segment.probability * 100)}%) `)
                    .join("")
                    .trim();
                if (text.length > 0) {
                    subtitleLog.info(green(text));
                    remoteControl.subtitles(Number(id), "final", text);
                }
                if (ignored.length > 0) {
                    subtitleLog.info(yellow(ignored));
                }
            } else {
                subtitleLog.info(subtitle);
            }
        }
        //console.log(data.toString());
    });
    pythonProcess.stderr.on('data', (data: string) => {
        subtitleLog.error(data.toString());
    });
}
//pythonProcess.kill();