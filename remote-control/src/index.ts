import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import path from "node:path";
import { BehaviorSubject, debounceTime, EMPTY, filter, firstValueFrom, map, merge, Observable, scan, shareReplay, switchMap, takeUntil, tap } from "rxjs";
import { log, logger } from 'shared/logger';
import { serverSocket } from 'shared/websocket/server';
import { config } from "./config";
import { hotkey } from "./hotkeys";
import { initSocket } from "./socket";
import { observeSubtitles } from './subtitles';
const sound = require("sound-play");

declare module 'fastify' {
    interface FastifyRequest {
        dependencies: {
            [Key: string]: any
        }
    }
}

const publicDir = path.join(__dirname, "../");
const remoteControl = initSocket(config.socket, config.user, config.userName, config.discordId, config.userSortKey);

function dynamicConfig<T>(initial: T) {
    const subject$ = new BehaviorSubject<T>(initial);
    return [(value: T) => subject$.next(value), subject$] as const;
}

type Feed = {
    url: string,
    aspectRatio: string,
    sourceAspectRatio: string,
}

const [setFeed, feed$] = dynamicConfig<Feed | null>({
    aspectRatio: "16/9",
    sourceAspectRatio: "16/9",
    url: null
});
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

        socket.addEvent("connectionStatus", remoteControl.isConnected$.pipe(
            map(isConnected => ({ isConnected }))
        ));

        merge(
            configSetters$
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

remoteControl.subtitlesEnabled$.pipe(
    switchMap(enabled => {
        if (enabled && config.subtitles == "whisper") {
            return observeSubtitles().pipe(
                tap(subtitle => remoteControl.subtitles(subtitle.id, "final", subtitle.text))
            )
        }
        return EMPTY;
    })
).subscribe();