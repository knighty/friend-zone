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
import { filter, Observable } from 'rxjs';
import { logger } from 'shared/logger';
import { objectMapArray } from 'shared/utils';
import config, { isDiscordConfig, isMippyChatGPT, isMippyDumb, isTwitchConfig } from "./config";
import DiscordVoiceState from './data/discord-voice-state';
import ExternalFeeds from './data/external-feeds';
import mockUsers from './data/mock-users';
import { StreamEventWatcher } from './data/stream-event-watcher';
import Subtitles from './data/subtitles';
import TwitchChat from './data/twitch-chat';
import { UserAuthTokenSource } from './data/twitch/auth-tokens';
import Users from './data/users';
import Webcam from './data/webcam';
import WordOfTheHour from './data/word-of-the-hour';
import { MissingError } from './errors';
import { ChatGPTMippyBrain } from './mippy/chat-gpt-brain';
import { DumbMippyBrain } from './mippy/dumb-brain';
import { Mippy } from './mippy/mippy';
import { MippyBrain } from './mippy/mippy-brain';
import { MippyMessageRepository } from './mippy/storage';
import { initMippyTwitchIntegration } from './mippy/twitch-integration';
import { AudioRepository } from './plugins/audio-socket';
import { configSocket } from './plugins/config-socket';
import { errorHandler } from './plugins/errors';
import { fastifyFavicon } from "./plugins/favicon";
import { fastifyLogger } from './plugins/logger';
import { remoteControlSocket } from './plugins/remote-control-socket';
import { fastifyRobots } from './plugins/robots';
import { socket } from './plugins/socket';
import { initStreamModulesRouter } from './routes/stream-modules';
import { initTtsRouter } from './routes/tts';
import twitchRouter from './routes/twitch/auth';
import { getManifestPath } from './utils';

//------------------------------------------------------
// Constants
//------------------------------------------------------
const publicDir = path.join(__dirname, `/../../public`);

//------------------------------------------------------
// Fastify Init
//------------------------------------------------------
declare module 'fastify' {
    interface FastifyRequest {
        dependencies: {
            [Key: string]: any
        }
    }
}

const serverLog = logger("server");
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
        fileSize: 1024 * 1024 * 100,
    }
});
fastifyApp.register(cookie, {
    secret: "my-secret",
    parseOptions: {}
} as FastifyCookieOptions);
fastifyApp.register(websocket);

//------------------------------------------------------
// Error Handling
//------------------------------------------------------
fastifyApp.setErrorHandler(errorHandler);

//------------------------------------------------------ 
// Dependencies
//------------------------------------------------------
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
const streamingTTS = new AudioRepository();
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
    if (config.discord.voiceStatus) {
        for (let channel of config.discord.channels) {
            discordVoiceState.connectToChannel(channel);
        }
    }
}

if (isTwitchConfig(config.twitch)) {
    const twitchChat = new TwitchChat(config.twitch.channel);

    twitchChat.observeMessages().pipe(
        filter(message => message.highlighted)
    ).subscribe(message => {
        const prompt = { source: "chat", store: false, name: message.user } as const;
        if (isMippyChatGPT(config.mippy)) {
            const regex = config.mippy.filter;
            if (message.text.match(regex)) {
                mippy.ask("highlightedMessage", { message: "(the message was filtered, tell the user to be careful with their word usage)", user: message.user }, prompt)
            }
        }
        mippy.ask("highlightedMessage", { message: message.text.substring(0, 1000), user: message.user }, prompt)
    });

    wordOfTheHour.watchTwitchChat(twitchChat);
}

if (isMippyChatGPT(config.mippy)) {
    const authToken = new UserAuthTokenSource(path.join(__dirname, "../../twitch.json"));

    if (config.twitch.streamEvents) {
        const eventWatcher = new StreamEventWatcher();
        if (config.twitch.broadcasterId) {
            eventWatcher.watch(authToken, config.twitch.broadcasterId, mippy);
        }
    }

    if (mippy.brain instanceof ChatGPTMippyBrain) {
        if (isTwitchConfig(config.twitch)) {
            initMippyTwitchIntegration(mippy, mippy.brain, authToken, config.twitch, config.mippy.permissions);
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

//------------------------------------------------------
// Routes
//------------------------------------------------------
serverLog.info("Adding routes");

// Twitch
fastifyApp.register(twitchRouter(), { prefix: "/twitch" });

// Stream Modules
fastifyApp.register(initStreamModulesRouter(config), { prefix: "/stream-modules" });

// Sockets
const socketParam = <T, D>(type: string, observable$: Observable<T>) => ({ type, data: observable$ })
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
    mippySpeech: mippy.listen(),
    mippyHistory: mippy.observeHistory()
}, (value, key) => socketParam(key, value));

// Primary data socket
fastifyApp.register(socket(dataSources));

// Remote control socket
fastifyApp.register(remoteControlSocket(subtitles, feeds, users, mippy));

// Config socket
fastifyApp.register(configSocket(dataSources, feeds), { prefix: "/config" });

// Dashboard
fastifyApp.get("/dashboard", async (req, res) => {
    return res.viewAsync("dashboard", {
        socketUrl: `${config.socketHost}/config/websocket`,
        style: await getManifestPath("dashboard.css"),
        scripts: await getManifestPath("dashboard.js"),
    })
});

//------------------------------------------------------
// Static Routing
//------------------------------------------------------

// Static files
fastifyApp.register(fastifyStatic, {
    root: path.join(publicDir, '/dist'),
    cacheControl: config.staticCaching,
    maxAge: 3600 * 1000,
    prefix: "/static",
    decorateReply: true
});

// Robots
fastifyApp.register(fastifyRobots);

// TTS audio files
fastifyApp.register(initTtsRouter(streamingTTS), { prefix: "/tts" });

// Fav Icon
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

//------------------------------------------------------
// Default Routing
//------------------------------------------------------
fastifyApp.all("/*", async (req, res) => {
    throw new MissingError();
});

//------------------------------------------------------
// Init Server
//------------------------------------------------------
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