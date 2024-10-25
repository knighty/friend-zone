import { dom, fromDomEvent, fromElementEvent, observeScopedEvent, populateChildren } from "shared/dom";
import { sortChildren } from "shared/dom/sort-children";
import { toggleClass } from "shared/rx";
import { connectBrowserSocket } from "shared/websocket/browser";

const socket = connectBrowserSocket<{
    Events: {
        connectionStatus: boolean
        config: { key: string, value: any }
        windows: Record<string, string>
    }
}>(`${document.location.protocol == "https:" ? "wss:" : "ws:"}//${document.location.host}/websocket`);
socket.isConnected$.subscribe(isConnected => document.body.classList.toggle("connected", isConnected));

observeScopedEvent<HTMLInputElement, "input">(document, "input", "input[data-config]").subscribe(([event, element]) => {
    if (element.dataset.config) {
        const value = element.type == "checkbox" ? element.checked : element.value;
        socket.send("config", {
            key: element.dataset.config,
            value: value
        })
    }
})
observeScopedEvent<HTMLTextAreaElement, "input">(document, "input", "textarea[data-config]").subscribe(([event, element]) => {
    if (element.dataset.config) {
        const value = element.value;
        socket.send("config", {
            key: element.dataset.config,
            value: value
        })
    }
})

fromDomEvent(document.getElementById("updateFeedButton"), "click").subscribe(e => {
    socket.send("config", {
        key: "feed",
        value: {
            url: dom.id("feedUrl", HTMLInputElement).value,
            aspectRatio: dom.id("feedAspectRatio", HTMLInputElement).value,
            sourceAspectRatio: dom.id("feedSourceAspectRatio", HTMLInputElement).value,
        }
    })
})

fromDomEvent(dom.id("askMippyButton"), "click").subscribe(e => {
    socket.send("mippy/ask", dom.id("askMippy", HTMLInputElement).value);
    dom.id("askMippy", HTMLInputElement).value = "";
})

fromDomEvent(dom.id("mippySayButton"), "click").subscribe(e => {
    socket.send("mippy/say", dom.id("mippySay", HTMLInputElement).value);
    dom.id("mippySay", HTMLInputElement).value = "";
})

const windowsElement = document.querySelector<HTMLSelectElement>("#windows");
socket.on("windows").subscribe(windows => {
    populateChildren<string, HTMLOptionElement>(
        windowsElement,
        Object.keys(windows).sort((a, b) => a.localeCompare(b)),
        (element, item) => element.value == item,
        (item) => dom.option({ attributes: { value: item } }, windows[item]),
        (item, element) => element.textContent = windows[item]
    )
    sortChildren<HTMLOptionElement>(windowsElement, (a, b) => a.textContent.localeCompare(b.textContent));
})

fromElementEvent(dom.id("windows", HTMLSelectElement), "input").subscribe(select => {
    socket.send("mippy/window", select.value);
})

socket.on("connectionStatus").subscribe(toggleClass(dom.query(".server-connection-status"), "connected"));

socket.on("config").subscribe(data => {
    switch (data.key) {
        case "feed": {
            dom.id("feedUrl", HTMLInputElement).value = data.value?.url ?? "";
            dom.id("feedAspectRatio", HTMLInputElement).value = data.value?.aspectRatio ?? "16/9";
            dom.id("feedSourceAspectRatio", HTMLInputElement).value = data.value?.sourceAspectRatio ?? "16/9";
        } break;
        default: {
            const element = document.querySelector<HTMLElement>(`[data-config=${data.key}]`);
            if (element) {
                if (element instanceof HTMLInputElement && element.type == "checkbox") {
                    element.checked = !!data.value;
                } else if (element instanceof HTMLInputElement) {
                    element.value = data.value;
                }
                else if (element instanceof HTMLTextAreaElement) {
                    element.value = data.value;
                }
            }
        } break;
    }
});