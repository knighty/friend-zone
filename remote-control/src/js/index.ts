import { createElement, fromDomEvent, observeScopedEvent, populateChildren } from "shared/utils";
import { connectBrowserSocket } from "shared/websocket/browser";

if (window.webkitSpeechRecognition) {
    let lastId = 0;
    let actualId = 0;
    let lastMessage = "";
    let recognizing = false;

    let recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    reset();
    recognition.onend = () => {
        console.log("restarting");
        lastId = 0;
        recognition.start();
    }

    recognition.onresult = function (event) {
        const result = event.results[lastId];
        if (result) {
            if (result.isFinal) {
                socket.send("subtitle", {
                    type: "final",
                    id: actualId,
                    text: result[0].transcript
                })
                lastId++;
                actualId++;
            } else {
                let interim_transcript = "";
                for (var i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) { } else {
                        interim_transcript += event.results[i][0].transcript;
                    }
                }

                if (interim_transcript != lastMessage) {
                    socket.send("subtitle", {
                        type: "interim",
                        id: actualId,
                        text: interim_transcript
                    })
                    lastMessage = interim_transcript;
                }
            }
        }
    }

    function reset() {
        recognizing = false;
    }

    function toggleStartStop() {
        if (recognizing) {
            recognition.stop();
            reset();
        } else {
            recognition.start();
            recognizing = true;
        }
    }
}

const socket = connectBrowserSocket<{
    Events: {
        connectionStatus: boolean
        config: { key: string, value: any }
        windows: Record<string, string>
    }
}>(`${document.location.protocol == "https:" ? "wss:" : "ws:"}//${document.location.host}/websocket`);
socket.isConnected$.subscribe(isConnected => document.body.classList.toggle("connected", isConnected));

function element<T extends HTMLElement>(id: string) {
    return document.getElementById(id) as T;
}

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
            url: element<HTMLInputElement>("feedUrl").value,
            aspectRatio: element<HTMLInputElement>("feedAspectRatio").value,
            sourceAspectRatio: element<HTMLInputElement>("feedSourceAspectRatio").value,
        }
    })
})

fromDomEvent(document.getElementById("askMippyButton"), "click").subscribe(e => {
    socket.send("mippy/ask", element<HTMLInputElement>("askMippy").value);
    element<HTMLInputElement>("askMippy").value = "";
})

fromDomEvent(document.getElementById("mippySayButton"), "click").subscribe(e => {
    socket.send("mippy/say", element<HTMLInputElement>("mippySay").value);
    element<HTMLInputElement>("mippySay").value = "";
})

socket.on("windows").subscribe(windows => {
    populateChildren(
        document.querySelector<HTMLSelectElement>("#windows"),
        Object.keys(windows),
        (element, item) => (element as HTMLOptionElement).value == item,
        (item) => createElement("option", { value: item }, windows[item])
    )
})

fromDomEvent(document.getElementById("windows"), "input").subscribe(e => {
    socket.send("mippy/window", (e.target as HTMLSelectElement).value);
})

socket.on("connectionStatus").subscribe(isConnected => {
    document.querySelector(".server-connection-status").classList.toggle("connected", isConnected);
});

socket.on("config").subscribe(data => {
    switch (data.key) {
        case "feed": {
            element<HTMLInputElement>("feedUrl").value = data.value?.url ?? "";
            element<HTMLInputElement>("feedAspectRatio").value = data.value?.aspectRatio ?? "16/9";
            element<HTMLInputElement>("feedSourceAspectRatio").value = data.value?.sourceAspectRatio ?? "16/9";
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