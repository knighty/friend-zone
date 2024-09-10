
import WebSocket from "ws";

export function initSocket(url: string, userId: string) {
    const ws = new WebSocket(url);

    function send(type: string, data: object) {
        ws.send(JSON.stringify({
            type,
            data
        }));
    }

    ws.addEventListener("open", (event) => {
        send("user", { id: userId });
    });

    ws.addEventListener("close", (event) => {
        console.log("Socket closed");
    });

    function sendVoice(id: number, type: "interim" | "final", text: string) {
        send("subtitles", {
            type, text, id
        });
    }

    function remoteControl(action: string) {
        send("remote-control", {
            action
        });
    }

    return {
        sendVoice,
        remoteControl
    }
}