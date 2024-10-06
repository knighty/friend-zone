
export type WhisperConfig = {
    model: string,
    phrase_timeout: number,
    energy_threshold: number,
    min_probability: number,
    no_speech_threshold: number
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
    userPrompt: string,
    discordId: string,
    socket: string,
    whisper: WhisperConfig,
    subtitlesEnabled: boolean,
    subtitles: "off" | "whisper" | "browser"
}