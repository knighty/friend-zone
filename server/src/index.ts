import cookie, { FastifyCookieOptions } from '@fastify/cookie';
import fastifyFormBody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import fastifyStatic from '@fastify/static';
import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import 'dotenv/config';
import Fastify from "fastify";
import fs from "fs/promises";
import { green, stripColors } from 'kolorist';
import OpenAI from 'openai';
import path from "path";
import process from "process";
import qs from "qs";
import { buffer, from, merge, mergeAll, Observable, share, Subject, takeUntil, tap, withLatestFrom } from 'rxjs';
import { addHook, logger } from 'shared/logger';
import { objectMapArray } from 'shared/utils';
import config, { isDiscordConfig, isMippyChatGPT, isMippyDumb, isTwitchConfig } from "./config";
import DiscordVoiceState from './data/discord-voice-state';
import ExternalFeeds from './data/external-feeds';
import mockUsers from './data/mock-users';
import { Redemptions } from './data/redemptions';
import { Stream, StreamProperties } from './data/stream';
import { StreamEventWatcher } from './data/stream-event-watcher';
import Subtitles from './data/subtitles';
import { SubtitlesLog } from './data/subtitles/logs';
import TwitchChat, { TwitchChatLog } from './data/twitch-chat';
import { getRedemptions } from './data/twitch/api';
import { UserAuthTokenSource } from './data/twitch/auth-tokens';
import { twitchMessageSender } from './data/twitch/message-sender';
import Users from './data/users';
import Webcam from './data/webcam';
import WordOfTheHour from './data/word-of-the-hour';
import { MissingError } from './errors';
import { ChatGPTMippyBrain } from './mippy/chat-gpt-brain';
import { DumbMippyBrain } from './mippy/dumb-brain';
import { MippyHistoryRepository } from './mippy/history/repository';
import { Mippy } from './mippy/mippy';
import { MippyBrain } from './mippy/mippy-brain';
import { analyzeSubtitlesPlugin, createPollPlugin, createPredictionPlugin, highlightedMessagesPlugin, MippyPermissions as MippyPermission, MippyPluginConfigDefinition, MippyPluginConfigDefinitionValues, MippyPluginManager, mippyVoicePlugin, relayMessagesToTwitchPlugin, scheduleAnnouncerPlugin, streamEventsPlugin, wothSuggesterPlugin } from './mippy/plugins/plugins';
import { announcementsPlugin } from './mippy/plugins/plugins/announcements';
import { chatPlugin } from './mippy/plugins/plugins/chat';
import { personalityPlugin } from './mippy/plugins/plugins/personality';
import { screenshotPlugin, ScreenshotRepository } from './mippy/plugins/plugins/screenshot';
import { streamSettingsPlugin } from './mippy/plugins/plugins/stream-settings';
import { tickerPlugin } from './mippy/plugins/plugins/ticker';
import { configSocket } from './plugins/config-socket';
import { errorHandler } from './plugins/errors';
import { fastifyFavicon } from "./plugins/favicon";
import { fastifyLogger } from './plugins/logger';
import { remoteControlSocket } from './plugins/remote-control-socket';
import { fastifyRobots } from './plugins/robots';
import { socket } from './plugins/socket';
import { initStreamModulesRouter } from './routes/stream-modules';
import twitchRouter from './routes/twitch/auth';
import { getManifestPath } from './utils';

const logMessage$ = new Observable<string>(subscriber => {
    addHook(message => {
        subscriber.next(stripColors(message));
    });
}).pipe(
    share()
)
const logFile$ = from(fs.open(path.join(__dirname, "../../server.log"), "a"))
merge(
    logMessage$.pipe(takeUntil(logFile$), buffer(logFile$), mergeAll()),
    logMessage$
).pipe(
    withLatestFrom(logFile$),
    tap(([message, file]) => {
        file.write(message);
        file.write("\n");
    })
).subscribe();

console.log(`
⠀⠀⠀⠀⠀⠀⠀⣠⠀⠀⠀⠀⣠⠀⠀⢀⣤⠀⠀⢀⣴⣶⣶⣶⣶⣦⡀⠀⠀⢀⣴⣶⣶⣶⣶⣦⣄⠀⠀⠀⣴⠀⠀⠀⣠⣶⣶⣶⠖⠀
⠀⠀⠀⠀⠀⣠⣾⣿⠀⠀⣠⣾⣿⠀⣴⣿⣿⠀⣴⣿⡿⠿⠿⢿⣿⣿⣿⣆⣴⣿⣿⠿⠿⠿⣿⣿⣿⣧⣠⣾⣿⠀⢀⣴⣿⣿⡿⠁⠀⠀
⠀⠀⠀⢀⣾⣿⣿⣿⣤⣾⣿⣿⣿⠀⣿⣿⣿⢸⣿⣿⡇⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣴⣿⣿⡿⠋⠀⠀⠀⠀
⠀⢀⣴⣿⣿⢿⣿⣿⣿⡿⣿⣿⣿⠀⣿⣿⣿⢸⣿⣿⡇⢰⣶⣾⣿⣿⡿⠋⣿⣿⣿⢰⣶⣶⣿⣿⣿⠏⣿⣿⣿⣿⡿⠋⠀⠀⠀⠀⠀⠀
⠀⣿⣿⠟⠁⢸⣿⣿⠋⠀⣿⣿⣿⠀⣿⣿⣿⢸⣿⣿⡇⠸⠿⠿⠿⠛⠁⠀⣿⣿⣿⠸⠿⠿⠿⠛⠁⠀⣿⣿⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀
⠀⡟⠁⠀⠀⢸⠟⠁⠀⠀⣿⣿⣿⠀⣿⣿⣿⢸⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠀⠉⠉⠁⠀⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠈⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀
`)

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
let permissions: MippyPermission[] = [];
function getBrain(): MippyBrain {
    if (isMippyChatGPT(config.mippy)) {
        permissions = config.mippy.permissions;
        const mippyHistoryRepository = new MippyHistoryRepository(path.join(__dirname, "../../", config.mippy.history.file));
        if (!config.openai.key) {
            throw new Error("No OpenAI key provided");
        }
        const client = new OpenAI({
            apiKey: config.openai.key,
        });
        return new ChatGPTMippyBrain(client, config.mippy, users, mippyHistoryRepository);
    }
    if (isMippyDumb(config.mippy)) {
        return new DumbMippyBrain();
    }
    throw new Error("No valid brain for Mippy");
}
let brain = getBrain();
const screenshotRepository = new ScreenshotRepository(path => `${config.publicUrl}${path}`);
const mippy = new Mippy(brain, config.mippy, permissions);
const plugins = new MippyPluginManager(config.mippy.plugins);
const subtitles = new Subtitles(mippy);
const subtitlesLog = new SubtitlesLog(subtitles);
const wordOfTheHour = new WordOfTheHour(mippy);
wordOfTheHour.hookSubtitles(subtitles.stream$);
const discordVoiceState = new DiscordVoiceState();
const webcam = new Webcam();
const feeds = new ExternalFeeds();
const sayGoodbye = new Subject<void>();
const stream = new Stream();

// Mocks
if (config.mockUsers) {
    const mocks = mockUsers(config.mockUsers, users, feeds, discordVoiceState, subtitles);
}

// Discord
if (isDiscordConfig(config.discord)) {
    if (config.discord.voiceStatus) {
        for (let channel of config.discord.channels) {
            discordVoiceState.connectToChannel(channel);
        }
    }
}

// Mippy Plugins
plugins.addPlugin("analyzeSubtitles", options => analyzeSubtitlesPlugin(subtitlesLog));
plugins.addPlugin("wothSuggester", options => wothSuggesterPlugin(subtitlesLog, wordOfTheHour));
plugins.addPlugin("voice", options => mippyVoicePlugin(fastifyApp, config.socketHost, options));
plugins.addPlugin("screenshot", options => screenshotPlugin(fastifyApp, config, users, screenshotRepository));

if (isTwitchConfig(config.twitch)) {
    const twitch = config.twitch;
    const userToken = new UserAuthTokenSource(path.join(__dirname, "../../twitch.json"));
    const botToken = new UserAuthTokenSource(path.join(__dirname, "../../bot-token.json"));
    const twitchChat = new TwitchChat(twitch.channel);
    const twitchChatLog = new TwitchChatLog(twitchChat);
    const broadcasterId = twitch.broadcasterId;
    const botId = twitch.botId;
    const streamEventWatcher = new StreamEventWatcher(userToken);
    const redemptions = new Redemptions(streamEventWatcher, broadcasterId);
    const messageSender = twitchMessageSender(broadcasterId, botId, botToken);
    const streamProperties = new StreamProperties(userToken, broadcasterId, streamEventWatcher);

    wordOfTheHour.watchTwitchChat(twitchChat);

    plugins.addPlugin("ticker", options => tickerPlugin(fastifyApp, config.socketHost, userToken, broadcasterId));
    plugins.addPlugin("chat", options => chatPlugin(twitchChat, stream, userToken, broadcasterId));
    plugins.addPlugin("createPoll", options => createPollPlugin(userToken, broadcasterId, stream, options));
    plugins.addPlugin("createPrediction", options => createPredictionPlugin(userToken, broadcasterId, messageSender, stream, options));
    plugins.addPlugin("highlightedMessages", options => highlightedMessagesPlugin(twitchChat, twitchChatLog, redemptions));
    plugins.addPlugin("personality", options => personalityPlugin(redemptions));
    plugins.addPlugin("relayMessagesToTwitch", options => relayMessagesToTwitchPlugin(messageSender));
    plugins.addPlugin("scheduleAnnounce", options => scheduleAnnouncerPlugin(userToken, broadcasterId, sayGoodbye));
    plugins.addPlugin("streamEvents", options => streamEventsPlugin(userToken, broadcasterId, streamEventWatcher, stream));
    plugins.addPlugin("announcements", options => announcementsPlugin(stream, streamProperties));
    plugins.addPlugin("streamSettings", options => streamSettingsPlugin(userToken, broadcasterId));

    /*getRedemptions(userToken, broadcasterId).then(redeems => {
        for (let redeem of redeems) {
            console.log(`${redeem.id} - ${redeem.title}`);
        }
    })*/

    fastifyApp.get("/data/redemptions", async (req, res) => {
        const redemptions = await getRedemptions(userToken, broadcasterId);
        const enabled: Record<string, string> = {};
        const disabled: Record<string, string> = {};
        for (let redeem of redemptions) {
            (redeem.is_enabled ? enabled : disabled)[redeem.id] = redeem.title;
        }
        return {
            enabled, disabled
        };
    })
}

plugins.initPlugins(mippy);

//------------------------------------------------------
// Logging
//------------------------------------------------------
if (config.accessLogging) {
    serverLog.info("Enabling access logging");
    fastifyLogger(fastifyApp, { memory: false });
}

//------------------------------------------------------
// Routes
//------------------------------------------------------
serverLog.info("Adding routes");

// Twitch
fastifyApp.register(twitchRouter({
    main: {
        scopes: [
            "moderator:read:followers",
            "channel:read:redemptions",
            "channel:read:subscriptions",
            "channel:read:ads",
            "user:read:chat",
            "channel:read:redemptions",
            "channel:manage:polls",
            "channel:manage:redemptions",
            "channel:manage:predictions",
            "channel:manage:broadcast",
            "moderator:read:chatters",
            "bits:read",
        ],
        filePath: path.join(__dirname, "../../twitch.json")
    },
    bot: {
        scopes: [
            "user:read:chat",
            "user:write:chat",
        ],
        filePath: path.join(__dirname, "../../bot-token.json")
    },
}), { prefix: "/twitch" });

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
    mippyHistory: mippy.observeHistory(),
    isLive: stream.isLive$
}, (value, key) => socketParam(key, value));

// Primary data socket
fastifyApp.register(socket(dataSources));

// Remote control socket
fastifyApp.register(remoteControlSocket(subtitles, feeds, users, mippy, screenshotRepository, stream));

// Config socket
fastifyApp.register(configSocket(dataSources, feeds, sayGoodbye, mippy, stream), { prefix: "/config" });

// Dashboard
fastifyApp.get("/dashboard", async (req, res) => {
    const mippyPluginConfig: Record<string, {
        name: string,
        config: MippyPluginConfigDefinition,
        values: MippyPluginConfigDefinitionValues<any>
    }> = {};
    for (let pluginId in mippy.plugins) {
        const plugin = mippy.plugins[pluginId];
        mippyPluginConfig[pluginId] = {
            name: plugin.name,
            config: plugin.config.definition,
            values: plugin.config.values
        }
    }
    return res.viewAsync("dashboard", {
        mippyPluginConfig: JSON.stringify(mippyPluginConfig),
        socketUrl: `${config.socketHost}/config/websocket`,
        style: await getManifestPath("dashboard.css"),
        scripts: await getManifestPath("dashboard.js"),
    })
});

fastifyApp.get("/sub-analysis", async (req, res) => {
    const analysis = await subtitlesLog.analyzeLogs();
    return JSON.stringify(analysis);
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