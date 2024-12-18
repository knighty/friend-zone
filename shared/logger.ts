import { cyan, options, red, SupportLevel, yellow } from 'kolorist';
options.enabled = true;
options.supportLevel = SupportLevel.ansi256;

type LogType = "debug" | "warning" | "info" | "error"

type Hook = (message: string) => void;
const hooks: Hook[] = [];

export function addHook(hook: Hook) {
    hooks.push(hook);
}

export function removeHook(hook: Hook) {
    const index = hooks.indexOf(hook);
    if (index > -1) { // only splice array when item is found
        hooks.splice(index, 1); // 2nd parameter means remove one item only
    }
}

function logFactory(type: LogType, color: (s: string | number) => string) {
    const typeString = "";//type.padStart(7, " ") + ": ";
    return (message: string | any, category?: string) => {
        const text = `${color(`${typeString}${category ? yellow(`[${category}] `) : ``}${message instanceof Error ? message.message : message}`)}`;
        for (let hook of hooks) {
            hook(text);
        }
        if (message instanceof Error) {
            console.error(text)
        } else {
            console.log(text)
        }
    }
}

export const log = {
    level: "debug",
    debug: logFactory("debug", cyan),
    warning: logFactory("warning", yellow),
    info: logFactory("info", (s: string | number) => s.toString()),
    error: logFactory("error", red),
}

export function logger(category: string, enabled = true): Logger {
    let isEnabled = enabled;
    return {
        enabled: (enabled: boolean) => isEnabled = enabled,
        debug: (message: string) => isEnabled ? log.debug(message, category) : null,
        warning: (message: string) => isEnabled ? log.warning(message, category) : null,
        info: (message: string) => isEnabled ? log.info(message, category) : null,
        error: (message: any) => isEnabled ? log.error(message, category) : null,
    }
}

export type Logger = {
    enabled: (enabled: boolean) => void,
    debug: (message: string) => void,
    warning: (message: string) => void,
    info: (message: string) => void,
    error: (message: any) => void,
}