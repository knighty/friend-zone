import path from "node:path";

type Config = {
    hotkeys: {
        focus: string[],
        endFocus: string[],
    },
    url: string,
    vdoNinjaUrl: string,
    user: string,
    socket: string,
    whisper: {
        model: string,
        phrase_timeout: number,
        energy_threshold: number,
    }
}

export const config = require(path.join(__dirname, "../config.js")) as Config;