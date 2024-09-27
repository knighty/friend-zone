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
import { map, Observable, Subject } from 'rxjs';
import { logger } from 'shared/logger';
import { InferObservable } from "shared/rx/utils";
import { objectMapArray } from 'shared/utils';
import config from "./config";
import DiscordVoiceState from './data/discord-voice-state';
import { ExternalFeeds } from './data/external-feeds';
import { mockUsers } from './data/mock-users';
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
const feeds = new ExternalFeeds();
const mocks = mockUsers(config.mockUsers, users, feeds, discordVoiceState, subtitles);

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
    const anchor = (req.query.anchor ?? "")
        .split(" ")
        .reduce((anchor, part) => {
            switch (part) {
                case "left": anchor.h = "start";
                case "center": anchor.h = "center";
                case "right": anchor.h = "end";
                case "top": anchor.v = "start";
                case "middle": anchor.v = "center";
                case "bottom": anchor.v = "end";
            }
            return anchor;
        }, { h: "start", v: "end" });

    return res.viewAsync(`stream-modules/friends`, {
        anchor: `${anchor.v} ${anchor.h}`,
        anchorHorizontal: anchor.h,
        anchorVertical: anchor.v,
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

const dataSources = objectMapArray({
    woth: wordOfTheHour.observe(),
    webcam: webcam.observePosition(),
    users: users.observe(),
    voice: discordVoiceState.speaking.entries$,
    subtitles: subtitles.stream$,
    feed: feeds.observeFeeds(),
    feedPosition: feeds.feedPosition$,
    feedSize: feeds.feedSize$,
    feedCount: feeds.feedCount$,
    feedLayout: feeds.feedLayout$,
    slideshowFrequency: feeds.slideshowFrequency$,
}, (value, key) => {
    return socketParam(key, value);
});

fastifyApp.register(socket(dataSources));
fastifyApp.register(remoteControlSocket(subtitles, feeds, users));
function observableReceiver<T extends Subject<any>, U extends InferObservable<T>>(subject: T) {
    return (data: U) => subject.next(data);
}
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