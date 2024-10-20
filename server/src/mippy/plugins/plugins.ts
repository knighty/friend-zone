import fs from "fs";
import path from "path";
import { filter, map, Observable, startWith, Subject } from "rxjs";
import { Mippy } from "../mippy";

export { analyzeSubtitlesPlugin } from "./plugins/analyze-subtitles";
export { changePersonalityPlugin } from "./plugins/change-personality";
export { createPollPlugin, CreatePollPluginOptions } from "./plugins/create-poll";
export { createPredictionPlugin, CreatePredictionPluginOptions } from "./plugins/create-prediction";
export { highlightedMessagesPlugin } from "./plugins/highlighted-messages";
export { relayMessagesToTwitchPlugin } from "./plugins/message-relay";
export { scheduleAnnouncePlugin as scheduleAnnouncerPlugin } from "./plugins/schedule-announce";
export { streamEventsPlugin } from "./plugins/stream-events";
export { mippyVoicePlugin } from "./plugins/voice";
export { wothSuggesterPlugin } from "./plugins/woth-suggester";

export type MippyPlugin = {
    disable?: () => void
}

export type MippyPermissions = "createPoll" | "createPrediction" | "setWordOfTheHour" | "sendMessage";

// Config Items
type MippyPluginConfigItemBase<T, Type extends string> = {
    name: string,
    description?: string,
    type: Type,
    default: T
}

type MippyPluginConfigItemBoolean = MippyPluginConfigItemBase<boolean, "boolean"> & {
}

type MippyPluginConfigItemString = MippyPluginConfigItemBase<string, "string"> & {
    maxLength?: number,
}

type MippyPluginConfigItemNumber = MippyPluginConfigItemBase<number, "number"> & {
    min?: number,
    max?: number,
    step?: number
}

type MippyPluginConfigItemEnum = MippyPluginConfigItemBase<string, "enum"> & {
    values: Record<string, string>
}

type MippyPluginConfigItem = MippyPluginConfigItemString | MippyPluginConfigItemNumber | MippyPluginConfigItemEnum | MippyPluginConfigItemBoolean;

export type MippyPluginConfigDefinition = Record<string, MippyPluginConfigItem>;

// Plugin definition
export type MippyPluginDefinition = {
    name: string,
    config?: MippyPluginConfigDefinition;
    permissions?: MippyPermissions[],
    init: (mippy: Mippy, config: MippyPluginConfig<any>) => Promise<MippyPlugin | null>
}

// Plugin Options
export type MippyPluginOptions = any;

// Plugin Config
export type MippyPluginConfigDefinitionValues<Definition extends MippyPluginConfigDefinition> = {
    [Key in keyof Definition]: Definition[Key]["default"]
}
export class MippyPluginConfig<Definition extends MippyPluginConfigDefinition> {
    definition: Definition;
    values: MippyPluginConfigDefinitionValues<Definition>;
    update$ = new Subject<keyof Definition>();
    id: string;

    constructor(id: string, definition: Definition) {
        this.id = id;
        this.definition = definition;
        this.values = {} as any;
        for (let key in this.definition) {
            this.values[key] = this.definition[key].default;
        }
        try {
            const file = fs.readFileSync(this.getFilepath());
            const json = JSON.parse(file.toString());
            for (let key in this.definition) {
                if (json[key] !== undefined)
                    this.values[key] = json[key];
            }
        } catch (e) {
            this.save();
        }
    }

    getFilepath() {
        return path.join(__dirname, `../../../../config/mippy/${this.id}.json`);
    }

    setValue<Key extends keyof Definition>(key: Key, value: Definition[Key]["default"]) {
        this.values[key] = value;
        this.update$.next(key);
        this.save();
        /*if (this.definition[key].type == "string") {
            this.values[key] = value;
        }*/
    }

    save() {
        if (Object.keys(this.values).length != 0) {
            const file = fs.writeFileSync(this.getFilepath(), JSON.stringify(this.values));
        }
    }

    observe<Key extends keyof Definition>(key: Key): Observable<Definition[Key]["default"]> {
        return this.update$.pipe(
            filter(updatedKey => key == updatedKey),
            startWith(key),
            map(key => this.values[key] as Definition[Key]["default"])
        );
    }
}

// Plugin Manager
export class MippyPluginManager {
    plugins: { id: string, factory: (options: MippyPluginOptions) => MippyPluginDefinition }[] = [];
    enabledPlugins: Record<string, MippyPluginOptions> = {};

    constructor(plugins: Record<string, MippyPluginOptions>) {
        this.enabledPlugins = plugins;
    }

    addPlugin<Options = any>(id: string, factory: (options: Options) => MippyPluginDefinition) {
        this.plugins.push({
            id,
            factory
        });
    }

    initPlugins(mippy: Mippy) {
        const plugins: Record<string, MippyPluginDefinition> = {};
        for (let pluginId in this.enabledPlugins) {
            const options = this.enabledPlugins[pluginId];
            if (options.enabled || options.enabled === undefined) {
                const plugin = this.plugins.find(p => p.id == pluginId)?.factory(options);
                if (plugin) {
                    plugins[pluginId] = plugin;
                }
            }
        }
        mippy.initPlugins(plugins);
    }
}