
export type WhisperConfig = {
    model: string,
    phrase_timeout: number,
    energy_threshold: number,
    min_probability: number
}

export type Config = {
    hotkeys: {
        enabled: boolean,
        focus: string[],
        active: string[],
    },
    user: string,
    userName: string,
    userSortKey: number,
    discordId: string,
    socket: string,
    whisper: WhisperConfig,
    subtitles: "off" | "whisper" | "browser"
}