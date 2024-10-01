import path from "path";

function env<T>(key: string) {
    return process.env[key] ? <T>process.env[key] : undefined;
}

type MippyEnabledConfig = {
    enabled: true,
    brain: "dumb" | "chatgpt"
    prompt?: string,
    prompts: Partial<{
        wothSetWord: string,
        wothSetCount: string,
        question: string,
        setCategory: string,
        newFollower: string,
        newSubscriber: string,
        adBreak: string,
        setEmojiOnly: string
    }>
}

type MippyDisabledConfig = {
    enabled: false
}

export type MippyConfig = MippyDisabledConfig | MippyEnabledConfig;

export function isMippyEnabledConfig(config: MippyConfig): config is MippyEnabledConfig {
    return config.enabled;
}

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
    twitch: {
        channel?: string,
        clientId?: string,
        secret?: string,
        redirectUrl?: string,
        broadcasterId?: string
    },
    discord: {
        voiceStatus?: boolean,
        channels?: string[],
        clientId?: string,
        clientSecret?: string,
        redirectUri?: string,
    },
    socketHost: string,
    feeds: {
        slideshowFrequency: number,
        count: number,
        size: number,
        position: [number, number],
        layout: "row" | "column"
    },
    mockUsers?: { name: string, discordId: string, feed: string | null, sortKey: number, prompt: string }[],
    mippy: MippyConfig
};

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
        vdoNinjaUrl: null
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
        enabled: false
    }
};

export default {
    ...defaultConfig,
    ...require(path.join(__dirname, "../../server-config.js")),
} as Config