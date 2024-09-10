import { debounceTime, distinctUntilChanged, endWith, exhaustMap, filter, fromEvent, interval, map, Observable, scan, startWith, Subject, switchMap, takeWhile, tap } from "rxjs";
import { observeScopedEvent } from "./utils";

type SubtitleMessage = {
    id: number,
    text: string
}

class App extends HTMLElement {
    getPersonElement(id: string): HTMLElement {
        const e = document.querySelector(`.friend-list [data-person=${id}]`);
        if (e)
            return e as HTMLElement;
        throw new Error();
    }

    connectedCallback() {
        const ws = new WebSocket(`${document.location.protocol == "https:" ? "wss:" : "ws:"}//${document.location.host}/websocket`);

        const subtitles$: Record<string, Subject<SubtitleMessage>> = {};
        for (let el of document.querySelectorAll<HTMLElement>(".friend-list [data-person]")) {
            const subtitlesElement = el.querySelector(".subtitles");
            subtitles$[el.dataset.person] = new Subject<SubtitleMessage>();
            subtitles$[el.dataset.person].pipe(
                filter(e => e.text != ""),
                scan((a, c) => {
                    if (a.id == c.id) {
                        a.updateText(c.text);
                        return a;
                    } else {
                        const subject$ = new Subject<string>();
                        let cursor = 0;
                        let text = "";
                        a.id = c.id;
                        a.observable = subject$.pipe(
                            startWith(c.text),
                            tap(message => text = message),
                            exhaustMap(() => {
                                return interval(30).pipe(
                                    tap(() => cursor++),
                                    takeWhile(c => cursor <= text.length),
                                    endWith(1),
                                    map(() => text.substring(0, cursor)),
                                )
                            })
                        );
                        a.updateText = (t: string) => subject$.next(t);
                        return a;
                    }
                }, { id: -1, observable: null, updateText: null } as { id: number, observable: Observable<string>, updateText: (text: string) => void }),
                map(state => state.observable),
                distinctUntilChanged(),
                switchMap(observable => observable),
                tap(message => {
                    subtitlesElement.textContent = message;
                    subtitlesElement.scrollTo(0, subtitlesElement.scrollHeight);
                }),
                tap(message => subtitlesElement.classList.add("show")),
                debounceTime(3000),
                tap(message => subtitlesElement.classList.remove("show")),
            ).subscribe();
        }

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
                for (let id in message.data.users) {
                    const person = message.data.users[id];
                    const element = this.getPersonElement(id);
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
            if (message.type == "voice") {
                for (let el of document.querySelectorAll<HTMLElement>(".friend-list [data-person]")) {
                    el.classList.toggle("speaking", !!message.data.users[el.dataset.discordId]);
                }
            }
            if (message.type == "subtitles") {
                subtitles$[message.data.userId].next({
                    id: message.data.subtitleId,
                    text: message.data.text
                });
            }
        });

        const button = this.querySelector("button");
        if (button) {
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
            });
        }

        interval(1000).subscribe(() => {
            const date = new Date();
            const hours = date.getHours() % 12;
            const minutes = date.getMinutes().toString().padStart(2, "0");
            const seconds = date.getSeconds().toString().padStart(2, "0");
            this.querySelector(".webcam .time span:first-child").textContent = `${hours}:${minutes}:${seconds}`;
            this.querySelector(".webcam .time span:nth-child(2)").textContent = date.getHours() >= 12 ? "PM" : "AM";
        });

        window.addEventListener('obsSceneChanged', function (event) {
            document.body.dataset.scene = event.detail.name;
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