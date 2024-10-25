import { debounceTime, map, merge, shareReplay, startWith, Subject, switchMap } from "rxjs";
import { fromAjax } from "rxjs/internal/ajax/ajax";
import { dom, observeScopedEvent, populateChildren } from "shared/dom";
import { sortChildren } from "shared/dom/sort-children";
import { createElement } from "shared/utils";
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
    multiline?: number
}

type MippyPluginConfigItemNumber = MippyPluginConfigItemBase<number, "number"> & {
    min?: number,
    max?: number,
    step?: number
}

type MippyPluginConfigItemEnum = MippyPluginConfigItemBase<string, "enum"> & {
    values: Record<string, string>
}

type MippyPluginConfigItemStringArray = MippyPluginConfigItemBase<string[], "string-array"> & {
    maxCount?: number
}

type MippyPluginConfigItemRedemption = MippyPluginConfigItemBase<string, "redemption"> & {
}

type MippyPluginConfigItem = MippyPluginConfigItemString | MippyPluginConfigItemStringArray | MippyPluginConfigItemNumber | MippyPluginConfigItemEnum | MippyPluginConfigItemBoolean | MippyPluginConfigItemRedemption;

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

        const elements = dom.elements(document, {
            feedLayout: HTMLSelectElement,
            feedSize: HTMLInputElement,
            feedCount: HTMLInputElement,
            slideshowFrequency: HTMLInputElement,
            sayGoodbye: HTMLButtonElement,
            mippy: HTMLElement,
        });

        const refreshRedemptions$ = new Subject<void>();
        const redemptions = refreshRedemptions$.pipe(
            startWith(undefined),
            switchMap(() => fromAjax<Record<string, string>>({
                method: "GET",
                url: "/data/redemptions"
            })),
            map(response => {
                const values = response.response;
                values[""] = "None"
                return values;
            }),
            shareReplay(1)
        )

        dom.elementEvent(elements.get("feedLayout"), "input").subscribe(element => {
            socket.send("config/feedLayout", element.value);
        });

        dom.elementEvent(elements.get("slideshowFrequency"), "input").pipe(
            debounceTime(500),
        ).subscribe(element => socket.send("config/slideshowFrequency", element.value));

        dom.elementEvent(elements.get("feedSize"), "input").pipe(
            debounceTime(500),
        ).subscribe(element => socket.send("config/feedSize", element.value));

        dom.elementEvent(elements.get("feedCount"), "input").pipe(
            debounceTime(500),
        ).subscribe(element => socket.send("config/feedCount", element.value));

        dom.elementEvent(elements.get("sayGoodbye"), "click").subscribe(event => {
            socket.send("sayGoodbye", null);
        });

        socket.on("feedCount").subscribe(count => elements.get("feedCount").value = count.toString());
        socket.on("feedSize").subscribe(count => elements.get("feedSize").value = count.toString());
        socket.on("slideshowFrequency").subscribe(count => elements.get("slideshowFrequency").value = count.toString());
        socket.on("feedLayout").subscribe(layout => elements.get("feedLayout").value = layout);

        const mippyElement = elements.get("mippy");
        const configElement = dom.query(".plugin-config", HTMLElement, this);
        const config = JSON.parse(mippyElement.dataset.config) as MippyPluginConfig;
        for (let pluginId in config) {
            const plugin = config[pluginId];
            if (plugin.config === undefined)
                continue
            if (Object.keys(plugin.config).length == 0)
                continue;
            const element = createElement("section", {}, [
                dom.h1({}, plugin.name),
                ...Object.keys(plugin.config).map(key => {
                    const item = plugin.config[key];
                    function getElements() {
                        switch (item.type) {
                            case "number": {
                                return [
                                    dom.text(item.name),
                                    dom.input("range", plugin.values[key], {
                                        min: item.min?.toString() ?? "",
                                        max: item.max?.toString() ?? "",
                                        step: item.step?.toString() ?? "",
                                    }),
                                    dom.input("number", plugin.values[key]),
                                ]
                            }
                            case "boolean": {
                                return [
                                    dom.text(item.name),
                                    dom.input("checkbox", undefined, {
                                        checked: plugin.values[key] ? "checked" : undefined
                                    })
                                ]
                            }
                            case "string": {
                                return [
                                    dom.text(item.name),
                                    (item.multiline && item.multiline > 1) ? dom.textarea(plugin.values[key], {
                                        attributes: {
                                            rows: String(item.multiline)
                                        }
                                    }) : dom.input("text", plugin.values[key])
                                ]
                            }
                            case "string-array": {
                                return [
                                    dom.text(item.name),
                                    ...(plugin.values[key] as string[]).map(v => dom.div({}, [
                                        dom.input("text", v),
                                        createElement("button", { classes: ["button", "delete"] }, "Delete"),
                                    ])),
                                    createElement("button", { classes: ["button", "add"] }, "Add")
                                ]
                            }
                            case "enum": {
                                return [
                                    dom.text(item.name),
                                    dom.select({
                                        attributes: {
                                            value: plugin.values[key]
                                        }
                                    }, Object.keys(item.values).map(
                                        key => createElement("option", { value: key }, item.values[key])
                                    ))
                                ]
                            }
                            case "redemption": {
                                const select = dom.select();
                                let firstId = true;
                                const button = createElement("button", { classes: ["button"] }, "⟳");
                                button.addEventListener("click", () => refreshRedemptions$.next());
                                redemptions.subscribe(redemptions => {
                                    const value = firstId ? plugin.values[key] : select.value;
                                    firstId = false;
                                    populateChildren(
                                        select,
                                        Object.keys(redemptions),
                                        (element, item) => (element as HTMLOptionElement).value == item,
                                        (item) => createElement("option", { value: item }, redemptions[item])
                                    )
                                    sortChildren(select, (a, b) => a.textContent.localeCompare(b.textContent));
                                    select.value = value;
                                });
                                return [
                                    dom.text(item.name),
                                    select,
                                    button
                                ]
                            }
                        }
                        throw new Error("Invalid type");
                    }
                    return dom.label({
                        data: {
                            type: item.type,
                            plugin: pluginId,
                            item: key
                        },
                        attributes: {
                            title: item.description ?? ""
                        }
                    }, getElements())
                })
            ])
            configElement.appendChild(element);
        }

        const e$ = observeScopedEvent<HTMLInputElement, "input">(configElement, "input", "[data-type='number'] input");

        e$.subscribe(([e, element]) => {
            const label = element.closest("label");
            for (let input of label.querySelectorAll("input")) {
                input.value = element.value;
            }
        })

        observeScopedEvent<HTMLButtonElement, "click">(configElement, "click", "[data-type='string-array'] button.add").subscribe(([e, element]) => {
            element.closest("label").insertBefore(
                dom.div({}, [
                    dom.input("text", ""),
                    createElement("button", { classes: ["button", "delete"] }, "Delete")
                ]), element)
        })

        observeScopedEvent<HTMLButtonElement, "click">(configElement, "click", "[data-type='string-array'] button.delete").subscribe(([e, element]) => {
            element.closest("div").remove();
        })

        merge(
            e$.pipe(
                debounceTime(500),
                map(([e, element]) => {
                    const label = element.closest("label");
                    return {
                        element,
                        value: Number(element.value)
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(configElement, "input", "[data-type='boolean'] input").pipe(
                map(([e, element]) => {
                    console.log("gerg");
                    return {
                        element,
                        value: element.checked
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(configElement, "input", "[data-type='enum'] select").pipe(
                map(([e, element]) => {
                    return {
                        element,
                        value: element.value
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(configElement, "input", "[data-type='redemption'] select").pipe(
                map(([e, element]) => {
                    return {
                        element,
                        value: element.value
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(configElement, "input", "[data-type='string'] input, [data-type='string'] textarea").pipe(
                debounceTime(500),
                map(([e, element]) => {
                    return {
                        element,
                        value: element.value
                    }
                })
            ),
            observeScopedEvent<HTMLInputElement, "input">(configElement, "input", "[data-type='string-array'] input").pipe(
                debounceTime(500),
                map(([e, element]) => {
                    const inputs = Array.from(dom.queryAll<HTMLInputElement>("input", element.closest("label")));
                    return {
                        element,
                        value: inputs.map(input => input.value)
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