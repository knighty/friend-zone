import path from "path";

function env<T>(key: string) {
    return process.env[key] ? <T>process.env[key] : undefined;
}

type Config = {
    port: number,
    staticCaching: boolean,
    accessLogging: boolean,
    auth: {
        admins: string[]
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
    mockUsers: { name: string, feed: string | null, sortKey: number }[]
};

const defaultConfig: Config = {
    port: 3000,
    staticCaching: true,
    accessLogging: true,
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
    mockUsers: []
};

export default {
    ...defaultConfig,
    ...require(path.join(__dirname, "../../server-config.js")),
} as Config