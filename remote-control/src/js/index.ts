import { fromDomEvent, observeScopedEvent } from "../../../shared/utils";

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

const ws = new WebSocket(`${document.location.protocol == "https:" ? "wss:" : "ws:"}//${document.location.host}/websocket`);

function element<T extends HTMLElement>(id: string) {
    return document.getElementById(id) as T;
}

observeScopedEvent<HTMLInputElement, "input">(document, "input", "input[data-config]").subscribe(([event, element]) => {
    if (element.dataset.config) {
        const value = element.type == "checkbox" ? element.checked : element.value;
        ws.send(JSON.stringify({
            type: "config",
            data: {
                key: element.dataset.config,
                value: value
            }
        }))
    }
})
observeScopedEvent<HTMLTextAreaElement, "input">(document, "input", "textarea[data-config]").subscribe(([event, element]) => {
    if (element.dataset.config) {
        const value = element.value;
        ws.send(JSON.stringify({
            type: "config",
            data: {
                key: element.dataset.config,
                value: value
            }
        }))
    }
})

recognition.onresult = function (event) {
    const result = event.results[lastId];
    if (result) {
        if (result.isFinal) {
            ws.send(JSON.stringify({
                type: "subtitle",
                data: {
                    type: "final",
                    id: actualId,
                    text: result[0].transcript
                }
            }))
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
                ws.send(JSON.stringify({
                    type: "subtitle",
                    data: {
                        type: "interim",
                        id: actualId,
                        text: interim_transcript
                    }
                }))
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

fromDomEvent(document.getElementById("updateFeedButton"), "click").subscribe(e => {
    ws.send(JSON.stringify({
        type: "config",
        data: {
            key: "feed",
            value: {
                url: element<HTMLInputElement>("feedUrl").value,
                aspectRatio: element<HTMLInputElement>("feedAspectRatio").value,
            }
        }
    }))
})

// Connection opened
ws.addEventListener("open", (event) => {
    ws.send("Hello Server!");
});

ws.addEventListener("close", (event) => {
    console.log("Socket closed");
});

ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    switch (message.type) {
        case "connectionStatus":
            document.querySelector(".connection-status").classList.toggle("connected", message.data.isConnected);
            break;
        case "config":
            const element = document.querySelector<HTMLElement>(`[data-config=${message.data.key}]`);
            if (element) {
                if (element instanceof HTMLInputElement && element.type == "checkbox") {
                    element.checked = !!message.data.value;
                } else if (element instanceof HTMLInputElement) {
                    element.value = message.data.value;
                }
                else if (element instanceof HTMLTextAreaElement) {
                    element.value = message.data.value;
                }
            }
            break;
    }
});