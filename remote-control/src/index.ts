import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance } from "fastify";
import { Monitor, Window } from "node-screenshots";
import path from "node:path";
import { BehaviorSubject, combineLatest, concatMap, distinctUntilChanged, EMPTY, filter, map, merge, Observable, of, shareReplay, Subject, switchMap, tap, timer, withLatestFrom } from "rxjs";
import { log } from 'shared/logger';
import { filterMap } from 'shared/rx';
import { truncateString } from 'shared/text-utils';
import { ObservableEventProvider, serverSocket } from 'shared/websocket/server';
import sharp from "sharp";
import { Config } from "./config";
import { FeedSettings } from './data/feed';
import { focusFeed } from './data/focus';
import { observeSubtitles } from './data/subtitles';
import { hotkey } from './hotkeys';
import { getManifestPath } from './manifest';
import { initSocket } from "./socket";

/*
Config
*/
const defaultConfig = {
    userSortKey: 0,
    userPrompt: "",
    hotkeys: {
        enabled: true,
        focus: ["Left Control", "Left Alt", "F"],
        active: ["Left Control", "Left Alt", "D"],
        mippySkip: ["Left Control", "Left Alt", "S"],
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
}
const config: Config = {
    ...defaultConfig,
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
        activeWindows.sort((a, b) => a.appName.localeCompare(b.appName)).forEach((item) => {
            newWindows[item.id] = item;
            //w[item.id] = `${item.title} - ${item.width} x ${item.height}`;
            if (!windows[item.id] || windows[item.id].title != newWindows[item.id].title) {
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
        if (id == "monitor") {
            let monitor = Monitor.fromPoint(100, 100);
            return monitor;
        }
        if (windows[id]) {
            return windows[id];
        }
        return null;
    })
);

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
const askMippyToSkip$ = new Subject<void>();
const skip$ = merge(
    askMippyToSkip$,
    config.hotkeys.enabled ? hotkey(config.hotkeys.mippySkip) : EMPTY
);
const mippySay$ = new Subject<string>();
const focus$ = focusFeed(config);
const feedSettings = new FeedSettings();
const subtitlesEnabled$ = new BehaviorSubject(config.subtitlesEnabled);
const sendAsksEnabled$ = new BehaviorSubject(true);
const sendScreenEnabled$ = new BehaviorSubject(false);
const screenCapture$ = sendScreenEnabled$.pipe(switchMap(enabled => enabled ? selectedWindow$ : of(null)));

const ask$ = askMippy$.pipe(
    withLatestFrom(screenCapture$),
    concatMap(async ([text, source]) => {
        if (source == null) {
            return { text }
        }
        try {
            const capture = await source.captureImage();
            const png = sharp(await capture.toPng());
            const data = await png.resize(1024, 1024, { fit: 'inside' }).jpeg().toBuffer()
            return {
                text: text,
                image: data.toString("binary")
            }
        } catch (e) {
            log.error(e);
            return { text }
        }
    })
)
const remoteControl = initSocket(config.socket, {
    "user": of(user),
    "subtitles": subtitles$,
    "feed/register": feedSettings.active$.pipe(active => active ? feedSettings.feed$ : of(null)),
    "feed/focus": focus$.pipe(filter(focus => focus == true)),
    "feed/unfocus": focus$.pipe(filter(focus => focus == false)),
    "mippy/ask": ask$,
    "mippy/say": mippySay$,
    "mippy/skip": skip$,
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

type AskHandler = (text: string) => Promise<boolean>;
const askHandlers: AskHandler[] = [
    async text => {
        const skipRegex = /skip(?:.{0,20})/i;
        const match = text.match(skipRegex);
        if (match) {
            askMippyToSkip$.next();
        }
        return !!match;
    },
    async text => {
        askMippy$.next(text);
        return true;
    }
];

sendAsksEnabled$.pipe(
    switchMap(enabled => enabled ? finalSubtitles$ : EMPTY),
    switchMap(async sub => {
        const regex = /(?:[\.\?]|^)(?:.{0,10})(?:mippy|mipi|mippie|miffi|miffie)[,!](.*)/i
        const match = sub.text.match(regex);
        if (match) {
            const q = match[1].trim();

            for (let handler of askHandlers) {
                const result = await handler(q);
                if (result) {
                    break;
                }
            }
        }
    })
).subscribe()

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
        const mapConfig = <In>(key: string) => map<In, { key: string, value: In }>(value => ({ key, value }))
        const socket = serverSocket(ws, new ObservableEventProvider({
            config: merge(
                feedSettings.feed$.pipe(mapConfig("feed")),
                feedSettings.active$.pipe(mapConfig("feedActive")),
                subtitlesEnabled$.pipe(mapConfig("subtitlesEnabled")),
                sendAsksEnabled$.pipe(mapConfig("sendAsksEnabled")),
                sendScreenEnabled$.pipe(mapConfig("sendScreenEnabled")),
            ),
            connectionStatus: remoteControl.isConnected$,
            windows: windows$.pipe(
                map(windows => {
                    const w: Record<string, string> = {};
                    w["monitor"] = "Monitor";
                    for (let id in windows) {
                        w[id] = truncateString(`[${windows[id].appName}]: ${windows[id].title}`, 60);
                    }
                    return w;
                })
            )
        }), {
            url: req.url
        });

        const configMessage = <ConfigValue>(config: string): Observable<ConfigValue> => socket.on<{ key: string, value: any }>("config").pipe(
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

        socket.on<string>("mippy/ask").subscribe(question => {
            log.info(`Ask question: ${question}`, "mippy");
            askMippy$.next(question);
        });

        socket.on<string>("mippy/say").subscribe(message => {
            log.info(`Mippy Say: ${message}`, "mippy");
            mippySay$.next(message);
        });

        socket.on<string>("mippy/window").subscribe(message => {
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