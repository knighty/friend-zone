import path from "path";
import { FeedLayout } from "./data/external-feeds";

function env<T>(key: string) {
    return process.env[key] ? <T>process.env[key] : undefined;
}

function checkProps<T extends object, P extends keyof T>(o: T, props: P[]) {
    return props.reduce((a, c) => (c in o) && a, true);
}

export type MippyChatGPTConfig = {
    enabled: true,
    brain: "chatgpt",
    filter: RegExp,
    systemPrompt: {
        prompt: string,
        personality: string,
        tools: Record<string, string>,
    },
    permissions: Partial<{
        createPoll: boolean,
        createPrediction: boolean,
    }>,
    prompts: Partial<{
        wothSetWord: string,
        wothSetCount: string,
        question: string,
        setCategory: string,
        newFollower: string,
        newSubscriber: string,
        adBreak: string,
        setEmojiOnly: string,
        askMippy: string,
        pollEnd: string,
        predictionEnd: string,
        highlightedMessage: string
    }>
}

export type MippyDumbConfig = {
    enabled: true,
    brain: "dumb"
}

type MippyDisabledConfig = {
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
    streamEvents: boolean,
    channel: string,
    clientId: string,
    secret: string,
    redirectUrl: string,
    broadcasterId: string
}

export type MippyConfig = MippyDisabledConfig | MippyChatGPTConfig | MippyDumbConfig;

export type Config = {
    port: number,
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
        && checkProps(config, ["permissions", "prompts", "systemPrompt", "filter"])
        && checkProps(config.systemPrompt, ["personality", "prompt"]);
}

export function isMippyDumb(config: MippyConfig): config is MippyDumbConfig {
    return config.enabled && config.brain == "dumb";
}

export function isTwitchConfig(config: Partial<TwitchConfig>): config is TwitchConfig {
    return checkProps(config, ["streamEvents", "channel", "clientId", "secret", "redirectUrl", "broadcasterId"]);
}

export function isDiscordConfig(config: Partial<DiscordConfig>): config is DiscordConfig {
    return checkProps(config, ["voiceStatus", "channels", "clientId", "clientSecret", "redirectUri"]);
}

/*
Default Config
*/
const defaultConfig: Config = {
    port: 3000,
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
        streamEvents: false
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
        enabled: false
    }
};

export default {
    ...defaultConfig,
    ...require(path.join(__dirname, "../../server-config.js")),
} as Config