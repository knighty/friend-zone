import { fromEvent, interval } from "rxjs";
import { observeScopedEvent } from "./utils";

class App extends HTMLElement {
    getPersonElement(id: string): HTMLElement {
        const e = this.querySelector(`[data-person=${id}]`);
        if (e)
            return e as HTMLElement;
        throw new Error();
    }

    connectedCallback() {
        const ws = new WebSocket(`${document.location.protocol == "https:" ? "wss:" : "ws:"}//${document.location.host}/websocket`);

        // Connection opened
        ws.addEventListener("open", (event) => {
            ws.send("Hello Server!");
        });

        ws.addEventListener("close", (event) => {
            console.log("Socket closed");
        });

        // Listen for messages
        ws.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);
            if (message.type == "woth") {
                for (let id in message.data.people) {
                    const person = message.data.people[id];
                    const element = this.getPersonElement(person.id);
                    const countElement = element.querySelector(".count");
                    if (countElement) {
                        if (Number(countElement.textContent) !== person.count) {
                            element.classList.remove("animation");
                            element.offsetWidth;
                            element.classList.add("animation");
                            countElement.textContent = person.count;
                        }
                    }
                }
                const wordElement = this.querySelector(".word");
                if (wordElement) wordElement.textContent = message.data.word;
                const wothElement = this.querySelector<HTMLElement>(".word-of-the-hour");
                if (wothElement) wothElement.dataset.state = message.data.word ? "show" : "hidden";
            }
            if (message.type == "webcam") {
                const webcam = this.querySelector<HTMLElement>(".webcam");
                webcam.style.setProperty("--left", message.data.position[0]);
                webcam.style.setProperty("--top", message.data.position[1]);
            }
        });

        const button = this.querySelector("button");
        fromEvent(button, "click").subscribe(() => {
            const video = document.getElementById('video') as HTMLVideoElement;
            button.remove();
            if (video) {
                navigator.mediaDevices
                    .getUserMedia({ video: true, audio: false })
                    .then((stream) => {
                        video.srcObject = stream;
                        video.play();
                    })
                    .catch((err) => {
                        console.error(`An error occurred: ${err}`);
                    });
            }
        })

        interval(1000).subscribe(() => {
            const date = new Date();
            const hours = date.getHours() % 12;
            const minutes = date.getMinutes().toString().padStart(2, "0");
            const seconds = date.getSeconds().toString().padStart(2, "0");
            this.querySelector(".webcam .time span:first-child").textContent = `${hours}:${minutes}:${seconds}`;
            this.querySelector(".webcam .time span:nth-child(2)").textContent = date.getHours() >= 12 ? "PM" : "AM";
        });
    }
}

class Dashboard extends HTMLElement {
    connectedCallback() {
        observeScopedEvent<HTMLInputElement, "click">(this, "click", "[data-action=setWebcamPosition]").subscribe(([e, element]) => {
            const position = element.value.split(",");
            fetch("/settings/webcam-position", {
                method: "POST",
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ left: position[0], top: position[1] })
            });
        })
    }
}

customElements.define("x-app", App);
customElements.define("x-dashboard", Dashboard);