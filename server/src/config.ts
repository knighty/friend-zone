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
    }
};

export default {
    ...defaultConfig,
    ...require(path.join(__dirname, "../../server-config.js")),
} as Config