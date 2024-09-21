import cookie, { FastifyCookieOptions } from '@fastify/cookie';
import fastifyFormBody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import 'dotenv/config';
import Fastify from "fastify";
import { green } from 'kolorist';
import path from "path";
import process from "process";
import qs from "qs";
import { BehaviorSubject, map, Observable, of, repeat, scan, Subject, switchMap, timer } from 'rxjs';
import { logger } from 'shared/logger';
import config from "./config";
import DiscordVoiceState from './data/discord-voice-state';
import { ExternalFeeds } from './data/external-feeds';
import { sentences } from './data/sentences';
import Subtitles from './data/subtitles';
import { TwitchChat } from './data/twitch-chat';
import { Users } from './data/users';
import Webcam from './data/webcam';
import { WordOfTheHour } from './data/word-of-the-hour';
import { MissingError } from './errors';
import { configSocket } from './plugins/config-socket';
import { errorHandler } from './plugins/errors';
import { fastifyFavicon } from "./plugins/favicon";
import { fastifyLogger } from './plugins/logger';
import { remoteControlSocket } from './plugins/remote-control-socket';
import { socket } from './plugins/socket';
import { getManifestPath } from './utils';

//const RPC = require("discord-rpc");

const publicDir = path.join(__dirname, `/../../public`);

const serverLog = logger("server");

declare module 'fastify' {
    interface FastifyRequest {
        dependencies: {
            [Key: string]: any
        }
    }
}

serverLog.info("Config:");
serverLog.info(JSON.stringify(config));

/*
Fastify Init
*/
serverLog.info("Initialising fastify");
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

fastifyApp.register(fastifyFormBody, { parser: str => qs.parse(str) });
fastifyApp.register(multipart, {
    limits: {
        fileSize: 1024 * 1024 * 100,  // For multipart forms, the max file size
    }
});
fastifyApp.register(cookie, {
    secret: "my-secret", // for cookies signature
    parseOptions: {}     // options for parsing cookies
} as FastifyCookieOptions);

/*
Error Handling
*/
fastifyApp.setErrorHandler(errorHandler);

/* 
Dependencies
*/
serverLog.info("Creating dependencies");
const users = new Users();
const twitchChat = new TwitchChat(config.twitch.channel);
const wordOfTheHour = new WordOfTheHour(twitchChat);
wordOfTheHour.setWord("Bespoke");
const discordVoiceState = new DiscordVoiceState();
if (config.discord.voiceStatus) {
    for (let channel of config.discord.channels) {
        discordVoiceState.connectToChannel(channel);
    }
}
const webcam = new Webcam();
const subtitles = new Subtitles();

class Scene {
    id: string;
    feedSize$ = new BehaviorSubject<number>(30);
    feedPosition$ = new BehaviorSubject<[number, number]>([0, 0.5]);
    feedLayout$ = new BehaviorSubject<"row" | "column">("row");
}

const feeds = new ExternalFeeds();

function mockUser(name: string, image: string, sort: number) {
    users.addPerson(name.toLowerCase(), name, name, sort);
    if (image) {
        feeds.addFeed({
            active: true,
            focused: null,
            aspectRatio: "16/9",
            sourceAspectRatio: "16/9",
            url: `image:${image}`,
            user: name
        });
    };
    of('').pipe(
        switchMap(
            () => timer(500 + Math.random() * 1000)
        ),
        repeat(),
    ).subscribe(() => {
        if (Math.random() > 0.5) {
            discordVoiceState.startSpeaking$.next(name);
        } else {
            discordVoiceState.stopSpeaking$.next(name);
        }
    })
    const timer$ = of('').pipe(
        switchMap(
            () => timer(2000 + Math.random() * 5000)
        ),
        repeat(),
        scan((a, c) => ++a, 0),
    );
    timer$.subscribe(i => subtitles.handle(name.toLowerCase(), i, "final", sentences[Math.floor(sentences.length * Math.random())]))
};

mockUser("Dan", "https://www.godisageek.com/wp-content/uploads/FActorio-Main.jpg", 4);
mockUser("Leth", "https://i.ytimg.com/vi/O23kAaqFAeA/maxresdefault.jpg", 3);
mockUser("PHN", null, 1);

/*
Logging
*/
if (config.accessLogging) {
    serverLog.info("Enabling access logging");
    fastifyLogger(fastifyApp, { memory: false });
}

/*
Routes
*/
serverLog.info("Adding routes");

// Request level dependencies 
fastifyApp.addHook("onRequest", (req, res, done) => {
    req.dependencies = {

    }

    done();
});

/*
Static Routing
*/
fastifyApp.register(fastifyStatic, {
    root: path.join(publicDir, '/dist'),
    constraints: {},
    cacheControl: config.staticCaching,
    maxAge: 3600 * 1000,
    prefix: "/static",
});

fastifyApp.get("/robots.txt", async (req, res) => {
    res.header("Cache-control", "public").send(`User-Agent: *
Disallow:`)
});

/* 
Favicon
*/
fastifyApp.register(fastifyFavicon, { root: path.join(publicDir, '/dist') });

fastifyApp.get("/", async (req, res) => {
    return res.viewAsync("app", {
        webcam: config.video.webcam,
        vdoNinjaUrl: config.video.vdoNinjaUrl,
        showWebcam: false,
        socketUrl: `${config.socketHost}/websocket`,
        style: await getManifestPath("main.css"),
        scripts: await getManifestPath("main.js"),
    })
})

fastifyApp.get("/dashboard", async (req, res) => {
    return res.viewAsync("dashboard", {
        socketUrl: `${config.socketHost}/config/websocket`,
        style: await getManifestPath("dashboard.css"),
        scripts: await getManifestPath("dashboard.js"),
    })
});

/* 
Default Routing
*/
fastifyApp.all("/*", async (req, res) => {
    throw new MissingError();
});

fastifyApp.register(websocket);

function socketParam<T, D>(type: string, observable$: Observable<T>, project?: (data: T) => D) {
    return {
        type,
        data: observable$.pipe(
            map(data => project ? project(data) : data)
        )
    }
}

type StreamModule = {
    id: string,
}

function registerStreamModule(module: StreamModule) {
    fastifyApp.get(`/stream-modules/${module.id}`, async (req, res) => {
        return res.viewAsync(`stream-modules/${module.id}`, {
            socketUrl: `${config.socketHost}/websocket`,
            style: await getManifestPath("main.css"),
            scripts: await getManifestPath("main.js"),
        })
    })
}

fastifyApp.get<{
    Querystring: {
        anchor: string
    }
}>(`/stream-modules/friends`, async (req, res) => {
    const anchorParts = (req.query.anchor ?? "")
        .split(" ");
    const anchorHorizontal = anchorParts
        .map(pos => {
            switch (pos) {
                case "left": return "start"
                case "center": return "center"
                case "right": return "end"
                default: return ""
            }
        }).find(pos => pos != "") ?? "start"
    const anchorVertical = anchorParts
        .map(pos => {
            switch (pos) {
                case "top": return "start"
                case "middle": return "center"
                case "bottom": return "end"
                default: return ""
            }
        }).find(pos => pos != "") ?? "end"

    return res.viewAsync(`stream-modules/friends`, {
        anchor: `${anchorVertical} ${anchorHorizontal}`,
        anchorHorizontal: anchorHorizontal,
        anchorVertical: anchorVertical,
        socketUrl: `${config.socketHost}/websocket`,
        style: await getManifestPath("main.css"),
        scripts: await getManifestPath("main.js"),
    })
})

registerStreamModule({
    id: "feeds"
});
registerStreamModule({
    id: "woth"
});

const dataSources = [
    socketParam("woth", wordOfTheHour.observe()),
    socketParam("webcam", webcam.observePosition()),
    socketParam("voice", discordVoiceState.speaking$, map => ({
        users: Object.fromEntries(map)
    })),
    socketParam("subtitles", subtitles.stream$),
    socketParam("feed", feeds.observeFeeds(3)),
    socketParam("users", users.observeUsers()),
    socketParam("feedPosition", feeds.feedPosition$),
    socketParam("feedSize", feeds.feedSize$),
    socketParam("feedCount", feeds.feedCount$),
    socketParam("feedLayout", feeds.feedLayout$),
    socketParam("slideshowFrequency", feeds.slideshowFrequency$),
];
fastifyApp.register(socket(dataSources));
fastifyApp.register(remoteControlSocket(subtitles, feeds, users));
type InferObs<T> = T extends Subject<infer U> ? U : never;
function observableReceiver<T extends Subject<any>, U extends InferObs<T>>(subject: T) {
    return (data: U) => subject.next(data);
}
/*function receivers(receivers: Record<string, Subject<any>>) {
    let r: Record<string, any> = {};
    for(let receiver in receivers) {
        r[receiver] = observableReceiver(receivers[receiver]);
    }
    return r;
}
const efwef = receivers({
    "config/slideshowFrequency": feeds.slideshowFrequency$,
    "config/feedPosition": feeds.feedPosition$,
    "config/feedSize": feeds.feedSize$,
    "config/feedLayout": feeds.feedLayout$,
});*/
fastifyApp.register(configSocket(dataSources, {
    "config/slideshowFrequency": observableReceiver(feeds.slideshowFrequency$),
    "config/feedPosition": observableReceiver(feeds.feedPosition$),
    "config/feedSize": observableReceiver(feeds.feedSize$),
    "config/feedLayout": observableReceiver(feeds.feedLayout$),
    "config/feedCount": observableReceiver(feeds.feedCount$),
}));

serverLog.info("Listen...");
const server = fastifyApp.listen({ port: config.port, host: "0.0.0.0" }, function (err, address) {
    serverLog.info(`Running at ${green(`http://localhost:${config.port}`)}`);
    if (err) {
        serverLog.error(err.message);
        fastifyApp.log.error(err, "server")
        process.exit(1)
    }
})

process.on('SIGTERM', () => {
    serverLog.info('SIGTERM signal received: closing HTTP server')
    fastifyApp.close();
    serverLog.info('HTTP server closed')
});