
function env<T>(key: string) {
    return process.env[key] ? <T>process.env[key] : undefined;
}

export default {
    port: Number(process.env.PORT) || 3000,
    staticCaching: process.env.STATIC_CACHE == "true" || true,
    accessLogging: process.env.ACCESS_LOGGING || process.env.NODE_ENV == "development",
    auth: {

    },
    errors: {
        stackTraces: process.env.NODE_ENV == "development"
    },
    csrf: {
        tokenLength: 16, // Bytes of entropy
        tokenDuration: 60 * 60 * 1000
    },
    memoryStore: {
        host: "redis://redis"
    },
    database: {
        connectionLimit: 10,
        connection: {
            host: 'db',
            user: 'root',
            password: 'password',
            database: 'site'
        }
    },
    twitch: {
        log: process.env.TWITCH_LOG == "true" || false,
        channel: process.env.TWITCH_CHANNEL,
        updateFrequency: process.env.TWITCH_UPDATE_FREQUENCY ? Number(process.env.TWITCH_UPDATE_FREQUENCY) : 10 * 60 * 1000,
        clientId: process.env.TWITCH_CLIENT,
        secret: process.env.TWITCH_SECRET,
        redirectUrl: process.env.TWITCH_REDIRECT_URL,
    }
} satisfies Record<string, any>