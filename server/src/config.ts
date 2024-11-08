import path from "path";
import { FeedLayout } from "./data/external-feeds";
import { MippyPermissions, MippyPluginOptions } from "./mippy/plugins/plugins";

function env<T>(key: string) {
    return process.env[key] ? <T>process.env[key] : undefined;
}

function checkProps<T extends object, P extends keyof T>(o: T, props: P[]) {
    return props.reduce((a, c) => (c in o) && a, true);
}

export type MippyChatGPTConfig = MippyBaseConfig & {
    enabled: true,
    brain: "chatgpt",
    history: {
        file: string
    },
    systemPrompt: {
        prompt: string,
        personality: string,
        tools: Record<string, string>,
        personalities: Record<string, {
            prompt: string,
            voice?: string
        }>
    },
    permissions: MippyPermissions[],
    prompts: Partial<{
        adBreak: string,
        askMippy: string,
        cheer: string,
        generic: string,
        highlightedMessage: string,
        newFollower: string,
        newSubscriber: string,
        pollEnd: string,
        predictionEnd: string,
        question: string,
        resubscribe: string,
        sayGoodbye: string,
        sayHi: string
        scheduleAnnounce: string,
        setCategory: string,
        setEmojiOnly: string,
        setTitle: string,
        subtitlesAnalysis: string,
        suggestWordOfTheHour: string,
        wothSetCount: string,
        wothSetWord: string,
    }>
}

export type MippyDumbConfig = MippyBaseConfig & {
    enabled: true,
    brain: "dumb"
}

type MippyDisabledConfig = MippyBaseConfig & {
    enabled: false
}

type DiscordConfig = {
    voiceStatus: boolean,
    channels: string[],
    clientId: string,
    clientSecret: string,
    redirectUri: string,
}

export type TwitchConfig = {
    channel: string,
    clientId: string,
    secret: string,
    redirectUrl: string,
    broadcasterId: string,
    botId: string
}

export type MippyBaseConfig = {
    plugins: Record<string, MippyPluginOptions>,
    filter?: RegExp,
}

export type MippyConfig = (MippyDisabledConfig | MippyChatGPTConfig | MippyDumbConfig);

export type Config = {
    port: number,
    publicUrl: string,
    staticCaching: boolean,
    accessLogging: boolean,
    auth: {
        admins: string[]
    },
    openai: {
        key?: string
    },
    errors: {
        stackTraces: boolean
    },
    csrf: {
        tokenLength: number,
        tokenDuration: number
    },
    video: {
        webcam: boolean,
        vdoNinjaUrl?: string
    },
    twitch: Partial<TwitchConfig>,
    discord: Partial<DiscordConfig>,
    socketHost: string,
    feeds: {
        slideshowFrequency: number,
        count: number,
        size: number,
        position: [number, number],
        layout: FeedLayout
    },
    mockUsers?: { id: string, name: string, discordId: string, feed: string | null, sortKey: number, prompt: string }[],
    mippy: MippyConfig
};

/*
Type Guards
*/
export function isMippyChatGPT(config: MippyConfig): config is MippyChatGPTConfig {
    return config.enabled
        && config.brain == "chatgpt"
        && checkProps(config, ["permissions", "prompts", "systemPrompt", "filter", "history"])
        && checkProps(config.systemPrompt, ["personality", "prompt"])
        && checkProps(config.history, ["file"]);
}

export function isMippyDumb(config: MippyConfig): config is MippyDumbConfig {
    return config.enabled && config.brain == "dumb";
}

export function isTwitchConfig(config: Partial<TwitchConfig>): config is TwitchConfig {
    return checkProps(config, ["channel", "clientId", "secret", "redirectUrl", "broadcasterId", "botId"]);
}

export function isDiscordConfig(config: Partial<DiscordConfig>): config is DiscordConfig {
    return checkProps(config, ["voiceStatus", "channels", "clientId", "clientSecret", "redirectUri"]);
}

/*
Default Config
*/
const defaultConfig: Config = {
    port: 3000,
    publicUrl: "",
    staticCaching: true,
    accessLogging: true,
    openai: {
    },
    auth: {
        admins: []
    },
    errors: {
        stackTraces: process.env.NODE_ENV == "development"
    },
    csrf: {
        tokenLength: 16, // Bytes of entropy
        tokenDuration: 60 * 60 * 1000
    },
    video: {
        webcam: false,
    },
    twitch: {
    },
    discord: {
    },
    socketHost: "ws://localhost:3000",
    feeds: {
        slideshowFrequency: 30,
        count: 3,
        size: 30,
        position: [0.5, 0],
        layout: "row"
    },
    mockUsers: undefined,
    mippy: {
        enabled: false,
        plugins: []
    }
};

export default {
    ...defaultConfig,
    ...require(path.join(__dirname, "../../server-config.js")),
} as Config