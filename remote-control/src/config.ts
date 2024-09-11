import path from "node:path";

type Config = {
    hotkeys: {
        focus: string[],
        endFocus: string[],
    },
    user: string,
    userName: string,
    discordId: string,
    socket: string,
    whisper: {
        model: string,
        phrase_timeout: number,
        energy_threshold: number,
    },
    subtitles: "off" | "whisper" | "browser"
}

export const config = {
    hotkeys: {
        focus: ["Left Control", "Left Alt", "F"],
        endFocus: ["Left Control", "Left Alt", "D"],
    },
    socket: "ws://127.0.0.1:3000/remote-control/websocket",
    whisper: {
        model: "small",
        phrase_timeout: 3,
        energy_threshold: 500,
    },
    subtitles: "off",
    ...require(path.join(__dirname, "../../remote-control-config.js"))
} as Config;