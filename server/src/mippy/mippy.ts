import { green } from "kolorist";
import { BehaviorSubject, first, map, merge, of, Subject } from "rxjs";
import { logger } from 'shared/logger';
import { ObservableArray, ObservableMap } from "shared/rx";
import { executionTimer } from "shared/utils";
import { MippyConfig } from "../config";
import { MippyBrain, MippyPrompts, PartialPrompt } from "./mippy-brain";
import { MippyPermissions, MippyPlugin, MippyPluginConfig, MippyPluginDefinition } from "./plugins/plugins";

const log = logger("mippy");

export type MippyStreamEvent = {
    id: string,
    audio: {
        duration: number,
        finished: boolean,
    },
    message: {
        text: string
        finished: boolean,
    },
}

export type MippyStreamEventHistoryMessage = {
    text: string,
    id: string,
    duration: number
}

export class Mippy {
    enabled: boolean;
    brain: MippyBrain;
    messageHistory$ = new ObservableMap<string, MippyStreamEventHistoryMessage>()
    manualMessage$ = new Subject<{ text: string }>();
    audioId = 0;
    permissions: MippyPermissions[];
    config: MippyConfig;
    isLive = new BehaviorSubject(false);
    customPrompts = new ObservableArray<string>();

    constructor(brain: MippyBrain, config: MippyConfig, permissions: MippyPermissions[]) {
        this.brain = brain;
        log.info("Created Mippy");
        this.brain.receive().subscribe();
        const brainMessage$ = this.brain.receivePartials();
        const manualMessage$ = this.manualMessage$.pipe(
            map(message => of({
                text: message.text,
                finished: true,
            }))
        )
        const message$ = merge(brainMessage$, manualMessage$);
        this.enabled = config.enabled;
        this.permissions = permissions;
        this.config = config;
    }

    say(text: string) {
        this.manualMessage$.next({ text });
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, prompt: PartialPrompt = {}) {
        if (this.enabled)
            this.brain.ask(event, data, {
                ...prompt,
            });
    }

    observeHistory() {
        return merge(
            this.messageHistory$.keyValues$.pipe(
                first(),
            ),
            this.messageHistory$.keyCreated$
        )
    }

    isFilteredText(text: string) {
        if (this.config.filter) {
            if (text.match(this.config.filter)) {
                return true;
            }
        }
        return false;
    }

    plugins: Record<string, {
        name: string,
        config: MippyPluginConfig<any>
    }> = {};

    loadedPlugins: Record<string, MippyPlugin> = {}

    async initPlugins(plugins: Record<string, MippyPluginDefinition>) {
        for (let pluginId in plugins) {
            const plugin = plugins[pluginId];
            let hasPermission = true;
            if (plugin.permissions) {
                for (let permission of plugin.permissions) {
                    if (!this.permissions.includes(permission)) {
                        hasPermission = false;
                    }
                }
            }
            if (hasPermission) {
                try {
                    const timer = executionTimer();
                    const config = new MippyPluginConfig(pluginId, plugin.config ?? {});
                    const p = await plugin.init(this, config);
                    log.info(`Initialised plugin ${green(plugin.name)} in ${green(timer.end())}`);
                    this.plugins[pluginId] = {
                        name: plugin.name,
                        config: config
                    }
                    if (p) {
                        this.loadedPlugins[pluginId] = p;
                    }
                } catch (e: unknown) {
                    log.error(`Error initialising plugin ${green(plugin.name)}`);
                    throw new Error("Error initialising plugin", { cause: e });
                }
            }
        }
    }

    getPlugin<T extends MippyPlugin>(id: string) {
        for (let p in this.loadedPlugins) {
            if (p == id) {
                return this.loadedPlugins[p] as T;
            }
        }
        throw new Error("Plugin does not exist");
    }

    addCustomPrompt(prompt: string) {
        this.customPrompts.add(prompt);
        return {
            remove: () => {
                this.customPrompts.remove(prompt);
            }
        }
    }

    /*getPlugin<T extends new (...args: any[]) => T>(t: T) {
        for (let p of this.loadedPlugins) {
            if (p instanceof t) {
                return p as T;
            }
        }
        throw new Error("Plugin does not exist");
    }*/
}