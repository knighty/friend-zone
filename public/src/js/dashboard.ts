import { debounceTime } from "rxjs";
import { fromDomEvent, observeScopedEvent } from "shared/utils";
import { connectBrowserSocket } from "shared/websocket/browser";

const socket = connectBrowserSocket(document.body.dataset.socketUrl);
socket.isConnected$.subscribe(isConnected => document.body.classList.toggle("connected", isConnected));

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

        socket.receive<number>("feedCount").subscribe(count => (document.getElementById("feedCount") as HTMLInputElement).value = count.toString());
        socket.receive<number>("feedSize").subscribe(count => (document.getElementById("feedSize") as HTMLInputElement).value = count.toString());
        socket.receive<number>("slideshowFrequency").subscribe(count => (document.getElementById("slideshowFrequency") as HTMLInputElement).value = count.toString());
        socket.receive<string>("feedLayout").subscribe(layout => (document.getElementById("feedLayout") as HTMLSelectElement).value = layout);
    }
}

customElements.define("x-dashboard", Dashboard);