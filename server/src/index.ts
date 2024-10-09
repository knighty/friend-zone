import cookie, { FastifyCookieOptions } from '@fastify/cookie';
import fastifyFormBody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import 'dotenv/config';
import Fastify, { FastifyInstance } from "fastify";
import { green } from 'kolorist';
import path from "path";
import process from "process";
import qs from "qs";
import { catchError, EMPTY, exhaustMap, filter, from, map, merge, Observable, share, Subject, tap, throttleTime } from 'rxjs';
import { logger } from 'shared/logger';
import filterMap from 'shared/rx/operators/filter-map';
import { InferObservable } from "shared/rx/utils";
import { objectMapArray } from 'shared/utils';
import config, { isDiscordConfig, isMippyChatGPT, isMippyDumb, isTwitchConfig } from "./config";
import DiscordVoiceState from './data/discord-voice-state';
import ExternalFeeds from './data/external-feeds';
import mockUsers from './data/mock-users';
import { StreamEventWatcher } from './data/stream-event-watcher';
import Subtitles from './data/subtitles';
import TwitchChat from './data/twitch-chat';
import { createPoll, createPrediction } from './data/twitch/api';
import { UserAuthTokenSource } from './data/twitch/auth-tokens';
import Users from './data/users';
import Webcam from './data/webcam';
import WordOfTheHour from './data/word-of-the-hour';
import { MissingError } from './errors';
import ejsLayout from './layout';
import { getWavHeader } from './lib/wav-header';
import { ChatGPTMippyBrain } from './mippy/chat-gpt-brain';
import { DumbMippyBrain } from './mippy/dumb-brain';
import { Mippy } from './mippy/mippy';
import { MippyBrain } from './mippy/mippy-brain';
import { MippyMessageRepository } from './mippy/storage';
import { ToolArguments } from './mippy/tools';
import { audioSocket, StreamingTTS } from './plugins/audio-socket';
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

/*serverLog.info("Config:");
serverLog.info(JSON.stringify(config));*/

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
function getBrain(): MippyBrain {
    if (isMippyChatGPT(config.mippy)) {
        const mippyHistoryRepository = new MippyMessageRepository(path.join(__dirname, "../../data/history.json"));
        if (!config.openai.key) {
            throw new Error("No OpenAI key provided");
        }
        return new ChatGPTMippyBrain(config.openai.key, config.mippy, users, mippyHistoryRepository);
    }
    if (isMippyDumb(config.mippy)) {
        return new DumbMippyBrain();
    }
    throw new Error("No valid brain for Mippy");
}
let brain = getBrain();
const streamingTTS = new StreamingTTS();
const mippy = new Mippy(brain, config.mippy, streamingTTS);
const subtitles = new Subtitles(mippy);
const wordOfTheHour = new WordOfTheHour(mippy);
wordOfTheHour.hookSubtitles(subtitles.stream$);
const discordVoiceState = new DiscordVoiceState();
const webcam = new Webcam();
const feeds = new ExternalFeeds();
if (config.mockUsers) {
    const mocks = mockUsers(config.mockUsers, users, feeds, discordVoiceState, subtitles);
}

if (isDiscordConfig(config.discord)) {
    for (let channel of config.discord.channels) {
        discordVoiceState.connectToChannel(channel);
    }
}

if (isTwitchConfig(config.twitch)) {
    const twitchChat = new TwitchChat(config.twitch.channel);

    twitchChat.observeMessages().pipe(
        filter(message => message.highlighted)
    ).subscribe(message => {
        const regex = /(?:fuck?|bitch|niggers?|shits?)/i
        const prompt = { source: "chat", store: false, name: message.user } as const;
        if (message.text.match(regex)) {
            mippy.ask("highlightedMessage", { message: "(the message was filtered, tell the user to be careful with their word usage)", user: message.user }, prompt)
        } else {
            mippy.ask("highlightedMessage", { message: message.text.substring(0, 1000), user: message.user }, prompt)
        }
    });

    wordOfTheHour.watchTwitchChat(twitchChat);
}

const mippyTwitchLog = logger("mippy-twitch-integration");
if (isMippyChatGPT(config.mippy)) {
    const authToken = new UserAuthTokenSource(path.join(__dirname, "../../twitch.json"));

    if (config.twitch.streamEvents) {
        const eventWatcher = new StreamEventWatcher();
        if (config.twitch.broadcasterId) {
            eventWatcher.watch(authToken, config.twitch.broadcasterId, mippy);
        }
    }

    if (mippy.brain instanceof ChatGPTMippyBrain) {
        const brain = mippy.brain;
        const toolCall$ = brain.receiveToolCalls().pipe(share());
        function tool<T extends keyof ToolArguments>(toolName: T, permission: string = "admin"): Observable<ToolArguments[T]> {
            const checkPermission = (source?: string) => {
                if (permission == "admin") {
                    return source == permission;
                }
                return true;
            }
            return toolCall$.pipe(
                filterMap(tool => tool.function.name == toolName && checkPermission(tool.prompt.source), tool => tool.function.arguments)
            );
        }

        function durationToSpeech(duration: number) {
            if (duration >= 60) {
                const minutes = Math.floor(duration / 60);
                return `${minutes} minute${minutes == 1 ? "" : "s"}`;
            }
            return `${duration} seconds`;
        }

        const permissions = config.mippy.permissions;

        if (isTwitchConfig(config.twitch)) {
            const twitchConfig = config.twitch;
            merge(
                tool("createPoll").pipe(
                    throttleTime(60000),
                    exhaustMap(args => {
                        mippy.say(`I just set up a poll titled "${args.title}" for ${durationToSpeech(args.duration)}`);
                        mippyTwitchLog.info(`Creating a poll (${args.duration} seconds): \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                        if (!permissions.createPoll)
                            return EMPTY;
                        return from(createPoll(authToken, twitchConfig.broadcasterId, args.title, args.options, args.duration)).pipe(
                            tap(result => mippyTwitchLog.info("Successfully set up poll")),
                            catchError(err => { mippyTwitchLog.error(err); return EMPTY; })
                        );
                    })
                ),

                tool("createPrediction").pipe(
                    throttleTime(60000),
                    exhaustMap(args => {
                        mippy.say(`I just set up a prediction titled "${args.title}" for ${durationToSpeech(args.duration)}`);
                        mippyTwitchLog.info(`Creating a prediction: \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                        if (!permissions.createPrediction)
                            return EMPTY;
                        return from(createPrediction(authToken, twitchConfig.broadcasterId, args.title, args.options, args.duration)).pipe(
                            tap(result => mippyTwitchLog.info("Successfully set up prediction")),
                            catchError(err => { mippyTwitchLog.error(err); return EMPTY; })
                        );
                    })
                ),

                tool("changePersonality").pipe(
                    tap(args => {
                        mippy.say("I got asked to change my personality");
                        brain.setPersonality(args.personality);
                        mippyTwitchLog.info(`Changing personality:\n${args.personality}`);
                    })
                )
            ).subscribe({
                error(err) {
                    mippyTwitchLog.error(err);
                }
            });
        }
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

fastifyApp.get<{
    Params: {
        id: number
    }
}>("/tts/audio/:id", (req, res) => {
    res.header('Content-Type', 'audio/wav');
    //res.header('Transfer-Encoding', 'chunked');

    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(getWavHeader());
            streamingTTS.getStream(req.params.id).observe().subscribe({
                next: data => {
                    try {
                        controller.enqueue(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
                    } catch (e) {
                        console.error(e);
                    }
                },
                complete: () => controller.close()
            })
        }
    });

    res.send(stream);
})

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
fastifyApp.register(audioSocket(streamingTTS));

function socketParam<T, D>(type: string, observable$: Observable<T>, project?: (data: T) => D) {
    return {
        type,
        data: observable$.pipe(
            map(data => project ? project(data) : data)
        )
    }
}

fastifyApp.register(async (fastify: FastifyInstance) => {
    type StreamModule = {
        id: string,
    }
    fastify.addHook('onRequest', ejsLayout("stream-modules/stream-module", async (req, res) => ({
        style: await getManifestPath("main.css"),
        scripts: await getManifestPath("main.js"),
        socketUrl: `${config.socketHost}/websocket`,
    })));
    function registerStreamModule(module: StreamModule) {
        fastify.get(`/${module.id}`, async (req, res) => {
            return res.viewAsync(`stream-modules/${module.id}`, {})
        })
    }

    fastify.get<{
        Querystring: {
            anchor: string
        },
    }>(`/friends`, async (req, res) => {
        const anchor = (req.query.anchor ?? "")
            .split(" ")
            .reduce((anchor, part) => {
                switch (part) {
                    case "left": anchor.h = "start"; break;
                    case "center": anchor.h = "center"; break;
                    case "right": anchor.h = "end"; break;
                    case "top": anchor.v = "start"; break;
                    case "middle": anchor.v = "center"; break;
                    case "bottom": anchor.v = "end"; break;
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
}, { prefix: "/stream-modules" })

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