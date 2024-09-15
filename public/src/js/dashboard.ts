import { debounceTime } from "rxjs";
import { fromDomEvent, observeScopedEvent } from "shared/utils";
import { connectBrowserSocket } from "shared/websocket/browser";

const socket = connectBrowserSocket(document.body.dataset.socketUrl);
socket.isConnected$.subscribe(isConnected => document.body.classList.toggle("connected", isConnected));

class Dashboard extends HTMLElement {
    connectedCallback() {
        observeScopedEvent<HTMLInputElement, "click">(this, "click", "[data-action=setWebcamPosition]").subscribe(([e, element]) => {
            const position = element.value.split(",");
            fetch("/settings/webcam-position", {
                method: "POST",
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ left: position[0], top: position[1] })
            });
        });

        observeScopedEvent<HTMLInputElement, "click">(this, "click", "[data-action=setFeedPosition]").subscribe(([e, element]) => {
            const position = element.value.split(",");
            socket.send("config/feedPosition", position);
        });

        fromDomEvent(document.getElementById("slideshowFrequency"), "input").pipe(
            debounceTime(500),
        ).subscribe(element => {
            socket.send("config/slideshowFrequency", (element.target as HTMLInputElement).value);
        })

        fromDomEvent(document.getElementById("feedSize"), "input").pipe(
            debounceTime(500),
        ).subscribe(element => {
            socket.send("config/feedSize", (element.target as HTMLInputElement).value);
        })
    }
}

customElements.define("x-dashboard", Dashboard);