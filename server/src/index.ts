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
import { EMPTY, exhaustMap, filter, map, merge, Observable, share, Subject, tap, throttleTime } from 'rxjs';
import { logger } from 'shared/logger';
import filterMap from 'shared/rx/operators/filter-map';
import { InferObservable } from "shared/rx/utils";
import { objectMapArray } from 'shared/utils';
import config, { isMippyChatGPT } from "./config";
import DiscordVoiceState from './data/discord-voice-state';
import ExternalFeeds from './data/external-feeds';
import mockUsers from './data/mock-users';
import { StreamEventWatcher } from './data/stream-event-watcher';
import Subtitles from './data/subtitles';
import TwitchChat from './data/twitch-chat';
import { createPrediction } from './data/twitch/api';
import { UserAuthTokenSource } from './data/twitch/auth-tokens';
import Users from './data/users';
import Webcam from './data/webcam';
import WordOfTheHour from './data/word-of-the-hour';
import { MissingError } from './errors';
import ejsLayout from './layout';
import { ChatGPTMippyBrain } from './mippy/chat-gpt-brain';
import { DumbMippyBrain } from './mippy/dumb-brain';
import { Mippy } from './mippy/mippy';
import { MippyBrain } from './mippy/mippy-brain';
import { configSocket } from './plugins/config-socket';
import { errorHandler } from './plugins/errors';
import { fastifyFavicon } from "./plugins/favicon";
import { fastifyLogger } from './plugins/logger';
import { remoteControlSocket } from './plugins/remote-control-socket';
import { socket } from './plugins/socket';
import twitchRouter from './routes/twitch/auth';
import { getManifestPath } from './utils';

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
fastifyApp.addHook('onRequest', ejsLayout("stream-modules/stream-module", async (req, res) => ({
    style: await getManifestPath("main.css"),
    scripts: await getManifestPath("main.js"),
    socketUrl: `${config.socketHost}/websocket`,
})));
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
let brain: MippyBrain = null;
if (isMippyChatGPT(config.mippy)) {
    brain = config.mippy.brain == "chatgpt" ? new ChatGPTMippyBrain(config.openai.key, config.mippy, users) : new DumbMippyBrain();
}
const mippy = new Mippy(brain, config.mippy);
const twitchChat = new TwitchChat(config.twitch.channel);
const subtitles = new Subtitles(mippy);
const wordOfTheHour = new WordOfTheHour(twitchChat, mippy);
wordOfTheHour.hookSubtitles(subtitles.stream$);
//wordOfTheHour.setWord("bespoke");
const discordVoiceState = new DiscordVoiceState();
if (config.discord.voiceStatus) {
    for (let channel of config.discord.channels) {
        discordVoiceState.connectToChannel(channel);
    }
}
const webcam = new Webcam();
const feeds = new ExternalFeeds();
if (config.mockUsers) {
    const mocks = mockUsers(config.mockUsers, users, feeds, discordVoiceState, subtitles);
}

type Tools = {
    createPoll: {
        title: string,
        options: string[],
        duration: number
    },
    createPrediction: {
        title: string,
        options: string[]
    },
    changePersonality: {
        personality: string
    }
}

const mippyTwitchLog = logger("mippy-twitch-integration");
if (isMippyChatGPT(config.mippy)) {
    const authToken = new UserAuthTokenSource(path.join(__dirname, "../../twitch.json"));

    if (config.twitch.streamEvents) {
        const eventWatcher = new StreamEventWatcher();
        if (config.twitch.broadcasterId) {
            eventWatcher.watch(authToken, config.twitch.broadcasterId, mippy);
        }

        twitchChat.observeMessages().pipe(
            filter(message => message.highlighted)
        ).subscribe(message => {
            const regex = /(?:fuck?|bitch|niggers?|shits?)/i
            if (message.text.match(regex)) {
                mippy.ask("askMippy", { question: "(the message was filtered, tell the user to be careful with their word usage)", user: message.user })
            } else {
                mippy.ask("askMippy", { question: message.text, user: message.user })
            }
        })
    }

    if (mippy.brain instanceof ChatGPTMippyBrain) {
        const brain = mippy.brain;
        const toolCall$ = brain.receiveToolCalls().pipe(share());
        function tool<T extends keyof Tools>(toolName: T): Observable<Tools[T]> {
            return toolCall$.pipe(
                filterMap(tool => tool.function.name == toolName && tool.source == "admin", tool => tool.function.arguments)
            );
        }

        merge(
            tool("createPoll").pipe(
                throttleTime(60000),
                exhaustMap(args => {
                    mippy.say(`I just set up a poll titled "${args.title}" for ${args.duration} seconds`);
                    mippyTwitchLog.info(`Creating a poll (${args.duration} seconds): \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                    /*return from(createPoll(authToken, config.twitch.broadcasterId, args.title, args.options, 60)).pipe(
                        tap(result => console.log(result)),
                        catchError(err => { mippyTwitchLog.error(err); return EMPTY; })
                    );*/
                    return EMPTY;
                })
            ),

            tool("createPrediction").pipe(
                tap(args => {
                    mippy.say(`I just set up a prediction titled "${args.title}"`);
                    createPrediction(authToken, config.twitch.broadcasterId, args.title, args.options, 60);
                    mippyTwitchLog.info(`Creating a prediction: \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                })
            ),

            tool("changePersonality").pipe(
                tap(args => {
                    mippy.say("I got asked to change my personality");
                    brain.setPersonality(args.personality);
                    mippyTwitchLog.info(`Changing personality:\n${args.personality}`);
                })
            )
        ).pipe(
            //retry()
        ).subscribe({
            error(err) {
                mippyTwitchLog.error(err);
            }
        });
    }
}

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

fastifyApp.register(twitchRouter(), { prefix: "/twitch" });

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
    decorateReply: true
});
fastifyApp.register(fastifyStatic, {
    root: path.join(__dirname, "../../tts/output"),
    constraints: {},
    cacheControl: config.staticCaching,
    maxAge: 3600 * 1000,
    prefix: "/tts/files",
    decorateReply: false
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
        return res.viewAsync(`stream-modules/${module.id}`, {})
    })
}

fastifyApp.get<{
    Querystring: {
        anchor: string
    },
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
    })
})

registerStreamModule({
    id: "feeds"
});
registerStreamModule({
    id: "woth"
});
registerStreamModule({
    id: "mippy"
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
    mippySpeech: mippy.listen()
}, (value, key) => {
    return socketParam(key, value);
});

fastifyApp.register(socket(dataSources));
fastifyApp.register(remoteControlSocket(subtitles, feeds, users, mippy));
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