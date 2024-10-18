import { debounceTime, map, merge } from "rxjs";
import { createElement, fromDomEvent, observeScopedEvent } from "shared/utils";
import { connectBrowserSocket } from "shared/websocket/browser";
import { ObservableEventProvider } from "shared/websocket/event-provider";

const socket = connectBrowserSocket<{
    Events: {
        feedCount: number,
        feedSize: number,
        slideshowFrequency: number,
        feedLayout: string
    }
}>(document.body.dataset.socketUrl, new ObservableEventProvider({}));
socket.isConnected$.subscribe(isConnected => document.body.classList.toggle("connected", isConnected));

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

type MippyPluginConfig = Record<string, {
    name: string,
    config: MippyPluginConfigDefinition,
    values: any
}>

class Dashboard extends HTMLElement {
    connectedCallback() {
        observeScopedEvent<HTMLInputElement, "click">(this, "click", "[data-action=setFeedPosition]").subscribe(([e, element]) => {
            const position = element.value.split(",");
            socket.send("config/feedPosition", position);
        });

        fromDomEvent(document.getElementById("feedLayout"), "input").subscribe(event => {
            socket.send("config/feedLayout", (event.target as HTMLSelectElement).value);
        });

        fromDomEvent(document.getElementById("slideshowFrequency"), "input").pipe(
            debounceTime(500),
        ).subscribe(event => {
            socket.send("config/slideshowFrequency", (event.target as HTMLInputElement).value);
        });

        fromDomEvent(document.getElementById("feedSize"), "input").pipe(
            debounceTime(500),
        ).subscribe(event => {
            socket.send("config/feedSize", (event.target as HTMLInputElement).value);
        });

        fromDomEvent(document.getElementById("feedCount"), "input").pipe(
            debounceTime(500),
        ).subscribe(event => {
            socket.send("config/feedCount", (event.target as HTMLInputElement).value);
        });

        fromDomEvent(document.getElementById("sayGoodbye"), "click").subscribe(event => {
            socket.send("sayGoodbye", null);
        });

        socket.on("feedCount").subscribe(count => (document.getElementById("feedCount") as HTMLInputElement).value = count.toString());
        socket.on("feedSize").subscribe(count => (document.getElementById("feedSize") as HTMLInputElement).value = count.toString());
        socket.on("slideshowFrequency").subscribe(count => (document.getElementById("slideshowFrequency") as HTMLInputElement).value = count.toString());
        socket.on("feedLayout").subscribe(layout => (document.getElementById("feedLayout") as HTMLSelectElement).value = layout);

        const mippyElement = this.querySelector<HTMLElement>("#mippy");
        const config = JSON.parse(mippyElement.dataset.config) as MippyPluginConfig;
        for (let pluginId in config) {
            const plugin = config[pluginId];
            if (plugin.config === undefined)
                continue;
            const element = createElement("section", {}, [
                createElement("h1", {}, plugin.name),
                ...Object.keys(plugin.config).map(key => {
                    const configItem = plugin.config[key];
                    function getElements() {
                        switch (configItem.type) {
                            case "number": {
                                return [
                                    document.createTextNode(configItem.name),
                                    createElement("input", {
                                        type: "range",
                                        attributes: {
                                            min: configItem.min?.toString() ?? "",
                                            max: configItem.max?.toString() ?? "",
                                            step: configItem.step?.toString() ?? "",
                                        },
                                        value: plugin.values[key]
                                    }),
                                    createElement("input", {
                                        type: "number",
                                        value: plugin.values[key]
                                    }),
                                ]
                            }
                            case "boolean": {
                                return [
                                    document.createTextNode(configItem.name),
                                    createElement("input", {
                                        type: "checkbox",
                                        attributes: {
                                            checked: plugin.values[key] ? "checked" : undefined
                                        }
                                    })
                                ]
                            }
                            case "string": {
                                return [
                                    document.createTextNode(configItem.name),
                                    createElement("input", {
                                        type: "text",
                                        value: plugin.values[key]
                                    })
                                ]
                            }
                            case "enum": {
                                return [
                                    document.createTextNode(configItem.name),
                                    createElement("select", {
                                        value: plugin.values[key]
                                    }, Object.keys(configItem.values).map(
                                        item => createElement("option", { value: item }, configItem.values[item])
                                    ))
                                ]
                            }
                        }
                        return [];
                    }
                    return createElement("label", {
                        data: {
                            type: configItem.type,
                            plugin: pluginId,
                            item: key
                        },
                        attributes: {
                            title: configItem.description ?? ""
                        }
                    }, getElements())
                })
            ])
            this.querySelector<HTMLElement>(".plugin-config").appendChild(element);
        }

        const e$ = observeScopedEvent<HTMLInputElement, "input">(mippyElement, "input", "[data-type='number'] input");

        e$.subscribe(([e, element]) => {
            const label = element.closest("label");
            for (let input of label.querySelectorAll("input")) {
                input.value = element.value;
            }
        })

        merge(
            e$.pipe(
                debounceTime(500),
                map(([e, element]) => {
                    const label = element.closest("label");
                    return {
                        element,
                        value: element.value
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(mippyElement, "input", "[data-type='boolean'] input").pipe(
                map(([e, element]) => {
                    return {
                        element,
                        value: element.checked
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(mippyElement, "input", "[data-type='enum'] select").pipe(
                map(([e, element]) => {
                    return {
                        element,
                        value: element.value
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(mippyElement, "input", "[data-type='string'] input").pipe(
                debounceTime(500),
                map(([e, element]) => {
                    return {
                        element,
                        value: element.value
                    }
                })
            )
        ).subscribe(p => {
            const label = p.element.closest("label");
            socket.send("mippy/plugin/config", {
                plugin: label.dataset.plugin,
                item: label.dataset.item,
                value: p.value
            })
        });
    }
}

customElements.define("x-dashboard", Dashboard);