import cookie, { FastifyCookieOptions } from '@fastify/cookie';
import fastifyFormBody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import 'dotenv/config';
import Fastify, { FastifyRequest } from "fastify";
import { green } from 'kolorist';
import path from "path";
import process from "process";
import qs from "qs";
import { map, startWith } from 'rxjs';
import config from "./config";
import DiscordVoiceState from './data/discord-voice-state';
import { ExternalFeeds } from './data/external-feeds';
import Subtitles from './data/subtitles';
import { TwitchChat } from './data/twitch-chat';
import { Users } from './data/users';
import Webcam from './data/webcam';
import { WordOfTheHour } from './data/word-of-the-hour';
import { MissingError } from './errors';
import { log, logger } from './lib/logger';
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
twitchChat.observeMessages().subscribe(message => log.info(`${message.user}: ${message.text}`));
const wordOfTheHour = new WordOfTheHour(twitchChat);
const discordVoiceState = new DiscordVoiceState();
if (config.discord.voiceStatus) {
    for (let channel of config.discord.channels) {
        discordVoiceState.connectToChannel(channel);
    }
}
const webcam = new Webcam();
const subtitles = new Subtitles();

const feeds = new ExternalFeeds();
feeds.focusedFeed$.subscribe(feed => {
});

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

fastifyApp.get("/test", (req, res) => {
    res.send("Hello World");
})

fastifyApp.get("/", async (req, res) => {
    return res.viewAsync("app", {
        webcam: config.video.webcam,
        vdoNinjaUrl: config.video.vdoNinjaUrl,
        showWebcam: false,
        style: await getManifestPath("main.css"),
        scripts: await getManifestPath("main.js"),
    })
})

fastifyApp.get("/dashboard", async (req, res) => {
    return res.viewAsync("dashboard", {
        style: await getManifestPath("dashboard.css"),
        scripts: await getManifestPath("main.js"),
    })
})

fastifyApp.post("/settings/webcam-position", async (req: FastifyRequest<{
    Body: {
        left: string,
        top: string;
    }
}>, res) => {
    webcam.setPosition(Number(req.body.left), Number(req.body.top));
    return res.send("done");
});

/* 
Default Routing
*/
fastifyApp.all("/*", async (req, res) => {
    throw new MissingError();
});

fastifyApp.register(websocket);

const woth$ = wordOfTheHour.update$.pipe(
    startWith(null),
    map(() => ({
        type: "woth",
        data: {
            word: wordOfTheHour.word,
            counts: Object.fromEntries(wordOfTheHour.counts)
        }
    }))
);

const users$ = users.updated$.pipe(
    map(users => ({
        type: "users",
        data: Object.fromEntries(users.users)
    }))
);

const webcam$ = webcam.update$.pipe(
    startWith(webcam),
    map(webcam => ({
        type: "webcam",
        data: {
            position: [webcam.left, webcam.top]
        }
    }))
)

const voiceState$ = discordVoiceState.speaking$.pipe(
    map(map => ({
        type: "voice",
        data: {
            users: Object.fromEntries(map)
        }
    }))
)

const subtitles$ = subtitles.stream$.pipe(
    map(event => ({
        type: "subtitles",
        data: event
    }))
)

const feed$ = feeds.focusedFeed$.pipe(
    map(feed => ({
        type: "feed",
        data: feed
    }))
)

fastifyApp.register(socket([woth$, webcam$, voiceState$, subtitles$, feed$, users$]));
fastifyApp.register(remoteControlSocket(subtitles, feeds, users));

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
    serverLog.info("Closing database")
    serverLog.info('HTTP server closed')
});