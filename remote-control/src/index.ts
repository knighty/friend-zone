import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance } from "fastify";
import { Monitor, Window } from "node-screenshots";
import path from "node:path";
import { BehaviorSubject, combineLatest, concatMap, distinctUntilChanged, EMPTY, filter, map, merge, Observable, of, shareReplay, Subject, switchMap, tap, timer, withLatestFrom } from "rxjs";
import { log } from 'shared/logger';
import { filterMap } from 'shared/rx';
import { switchMapToggle } from 'shared/rx/utils';
import { truncateString } from 'shared/text-utils';
import { ObservableEventProvider, serverSocket } from 'shared/websocket/server';
import sharp from "sharp";
import { Config } from "./config";
import { FeedSettings } from './data/feed';
import { focusFeed } from './data/focus';
import { observeSubtitles } from './data/subtitles';
import { getManifestPath } from './manifest';
import { initSocket } from "./socket";

/*
Config
*/
const config: Config = {
    userSortKey: 0,
    userPrompt: "",
    hotkeys: {
        enabled: true,
        focus: ["Left Control", "Left Alt", "F"],
        active: ["Left Control", "Left Alt", "D"],
    },
    socket: "ws://127.0.0.1:3000/remote-control/websocket",
    whisper: {
        model: "small",
        phrase_timeout: 3,
        energy_threshold: 500,
        min_probability: 0.5,
        no_speech_threshold: 0.6
    },
    subtitlesEnabled: true,
    subtitles: "off",
    ...require(path.join(__dirname, "../../remote-control-config.js"))
};

/*
Dependencies
*/
type WindowCollection = Record<string, Window>;
const windows$ = new Observable<WindowCollection>(subscriber => {
    let windows: WindowCollection = {};

    return timer(0, 5000).subscribe(i => {
        let activeWindows = Window.all();

        let changed = false;
        const newWindows: WindowCollection = {};
        activeWindows.sort((a, b) => a.title.localeCompare(b.title)).forEach((item) => {
            newWindows[item.id] = item;
            //w[item.id] = `${item.title} - ${item.width} x ${item.height}`;
            if (!windows[item.id]) {
                changed = true;
            }
        });

        for (let window in windows) {
            if (!newWindows[window])
                changed = true;
        }

        if (changed) {
            windows = newWindows;
            subscriber.next(windows);
        }
    })
}).pipe(shareReplay(1));

const selectedWindowId$ = new BehaviorSubject<string>("");
const selectedWindow$ = combineLatest(windows$, selectedWindowId$).pipe(
    map(([windows, id]) => {
        if (windows[id]) {
            return windows[id];
        }
        return null;
    })
);

type AskMippy = {
    text: string,
    image?: string
}

const user = {
    id: config.user,
    name: config.userName,
    discordId: config.discordId,
    sortKey: config.userSortKey,
    prompt: config.userPrompt
};
const subtitles$ = new Subject<{ id: number, text: string }>();
const finalSubtitles$ = new Subject<{ id: number, text: string }>();
const askMippy$ = new Subject<string>();
const mippySay$ = new Subject<string>();
const focus$ = focusFeed(config);
const feedSettings = new FeedSettings();
const subtitlesEnabled$ = new BehaviorSubject(config.subtitlesEnabled);
const sendAsksEnabled$ = new BehaviorSubject(false);
const sendScreenEnabled$ = new BehaviorSubject(false);

const ask$ = askMippy$.pipe(
    withLatestFrom(sendScreenEnabled$.pipe(switchMap(enabled => enabled ? selectedWindow$ : of(null)))),
    concatMap(async ([text, window]) => {
        if (window == null) {
            return { text }
        }
        let monitor = Monitor.fromPoint(100, 100);
        let image = await (window ? window.captureImage() : monitor.captureImage());
        const img = sharp(image.toPngSync());
        let data = await img.resize(1024, 1024, { fit: 'inside' }).jpeg().toBuffer()

        return {
            text: text,
            image: data.toString("binary")
        }
    })
)
const remoteControl = initSocket(config.socket, {
    user: of(user),
    subtitles: subtitles$,
    "feed/register": feedSettings.active$.pipe(switchMapToggle(active => active, () => feedSettings.feed$, () => of(null))),
    "feed/focus": focus$.pipe(filter(focus => focus == true)),
    "feed/unfocus": focus$.pipe(filter(focus => focus == false)),
    "mippy/ask": ask$,
    "mippy/say": mippySay$,
}, selectedWindow$);

combineLatest([remoteControl.subtitlesEnabled$, subtitlesEnabled$]).pipe(
    map(([a, b]) => a && b),
    distinctUntilChanged(),
    switchMap(enabled => {
        if (enabled && config.subtitles == "whisper") {
            return observeSubtitles(config.whisper).pipe(
                tap(subtitle => {
                    subtitles$.next(subtitle);
                    if (subtitle.type == "final") {
                        finalSubtitles$.next(subtitle);
                    }
                }),
            )
        }
        return EMPTY;
    })
).subscribe();

sendAsksEnabled$.pipe(
    switchMap(enabled => enabled ? finalSubtitles$ : EMPTY)
).subscribe(sub => {
    const regex = /(?:[\.\?]|^)(?:.{0,10})(?:mippy|mipi|mippie)[,!](.*)/i
    const match = sub.text.match(regex);
    if (match) {
        const q = match[1];
        askMippy$.next(q);
    }
})

/*
Fastify Setup
*/
const fastifyApp = Fastify();

// Template engine
fastifyApp.register(fastifyView, {
    engine: {
        ejs: require("ejs"),
    },
    root: path.join(__dirname, 'views'),
    propertyName: 'view',
    asyncPropertyName: 'viewAsync',
    viewExt: 'ejs',
});

// Sockets
fastifyApp.register(websocket);

// Static
const publicDir = path.join(__dirname, "../");
fastifyApp.register(fastifyStatic, {
    root: path.join(publicDir, '/dist'),
    constraints: {},
    cacheControl: true,
    maxAge: 3600 * 1000,
    prefix: "/static",
});

/*
Routes
*/

// Config socket
fastifyApp.register(async (fastify: FastifyInstance) => {
    fastify.get('/websocket', { websocket: true }, (ws, req) => {
        const socket = serverSocket<{
            Events: {
                config: { key: string, value: any },
                "mippy/ask": string,
                "mippy/say": string,
                "mippy/window": string
            }
        }>(ws, new ObservableEventProvider({
            config: merge(
                feedSettings.feed$.pipe(map(feed => ({ key: "feed", value: feed }))),
                feedSettings.active$.pipe(map(active => ({ key: "feedActive", value: active }))),
                subtitlesEnabled$.pipe(map(enabled => ({ key: "subtitlesEnabled", value: enabled }))),
            ),
            connectionStatus: remoteControl.isConnected$,
            windows: windows$.pipe(
                map(windows => {
                    const w: Record<string, string> = {};
                    for (let id in windows) {
                        w[id] = truncateString(`${windows[id].appName} - ${windows[id].title}`, 60);
                    }
                    return w;
                })
            )
        }));

        const configMessage = <ConfigValue>(config: string): Observable<ConfigValue> => socket.on("config").pipe(
            filterMap(message => message.key == config, message => message.value)
        );

        configMessage<{
            url: string,
            aspectRatio: string,
            sourceAspectRatio: string
        }>("feed").subscribe(feed => feedSettings.feed$.next(feed.url != "" ? feed : null))

        configMessage<boolean>("feedActive").subscribe(active => feedSettings.active$.next(active));
        configMessage<boolean>("subtitlesEnabled").subscribe(enabled => subtitlesEnabled$.next(enabled));
        configMessage<boolean>("sendAsksEnabled").subscribe(enabled => sendAsksEnabled$.next(enabled));
        configMessage<boolean>("sendScreenEnabled").subscribe(enabled => sendScreenEnabled$.next(enabled));

        socket.on("mippy/ask").subscribe(question => {
            log.info(`Ask question: ${question}`, "mippy");
            askMippy$.next(question);
        });

        socket.on("mippy/say").subscribe(message => {
            log.info(`Mippy Say: ${message}`, "mippy");
            mippySay$.next(message);
        });

        socket.on("mippy/window").subscribe(message => {
            selectedWindowId$.next(message);
        });
    })
});

// Config page
fastifyApp.get("/", async (req, rep) => {
    return rep.viewAsync("app", {
        style: await getManifestPath("main.css"),
        scripts: await getManifestPath("main.js"),
    })
});

/*
Server setup
*/
const server = fastifyApp.listen({ port: 3010, host: "0.0.0.0" }, function (err, address) {
    console.log(`Running at http://localhost:${3010}`);
    if (err) {
        console.error(err.message);
        fastifyApp.log.error(err, "server")
        process.exit(1)
    }
});