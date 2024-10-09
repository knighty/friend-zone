import { debounceTime } from "rxjs";
import { fromDomEvent, observeScopedEvent } from "shared/utils";
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

        socket.on("feedCount").subscribe(count => (document.getElementById("feedCount") as HTMLInputElement).value = count.toString());
        socket.on("feedSize").subscribe(count => (document.getElementById("feedSize") as HTMLInputElement).value = count.toString());
        socket.on("slideshowFrequency").subscribe(count => (document.getElementById("slideshowFrequency") as HTMLInputElement).value = count.toString());
        socket.on("feedLayout").subscribe(layout => (document.getElementById("feedLayout") as HTMLSelectElement).value = layout);
    }
}

customElements.define("x-dashboard", Dashboard);