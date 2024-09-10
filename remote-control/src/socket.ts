
import WebSocket from "ws";
import { config } from "./config";

export function initSocket(url: string, userId: string) {
    const ws = new WebSocket(url);

    function send(type: string, data?: object) {
        ws.send(JSON.stringify({
            type,
            data
        }));
    }

    ws.addEventListener("open", (event) => {
        send("user", { id: userId });
        send("feed/register", { url: config.vdoNinjaUrl })
    });

    ws.addEventListener("close", (event) => {
        console.log("Socket closed");
    });

    function subtitles(id: number, type: "interim" | "final", text: string) {
        send("subtitles", {
            type, text, id
        });
    }

    function feed(action: string, data?: object) {
        send(`feed/${action}`, data);
    }

    return {
        subtitles: subtitles,
        feed
    }
}