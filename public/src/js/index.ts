import { BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, endWith, exhaustMap, filter, fromEvent, interval, map, merge, Observable, scan, share, startWith, Subject, switchMap, takeWhile, tap } from "rxjs";
import { observeScopedEvent } from "../../../shared/utils";

type SubtitleMessage = {
    id: number,
    text: string
}
type SocketMessage<D> = {
    type: string,
    data: D;
}

namespace SocketMessageData {
    export type Woth = {
        counts: Record<string, number>,
        word: string
    }
    export type Webcam = {
        position: readonly [number, number]
    }
    export type Voice = {
        users: Record<string, boolean>
    }
    export type Subtitles = {
        subtitleId: number,
        text: string,
        userId: number
    }
    export type Users = Record<string, {
        id: string,
        name: string,
        discordId: string
    }>
    export type FocusedFeed = {
        user: string,
        focused: string,
        active: boolean,
        url: string,
        aspectRatio: string
    }
}

const ws = new WebSocket(`${document.location.protocol == "https:" ? "wss:" : "ws:"}//${document.location.host}/websocket`);
const websocketMessages$ = fromEvent<MessageEvent>(ws, "message").pipe(
    map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
    share()
);

function socketMessages<D>(type: string): Observable<D> {
    return websocketMessages$.pipe(
        filter(message => message.type == type),
        map<SocketMessage<D>, D>(message => message.data as D)
    )
}

class App extends HTMLElement {
    getPersonElement(id: string): HTMLElement {
        return document.querySelector(`.friend-list [data-person=${id}]`) as HTMLElement;
    }

    connectedCallback() {
        const subtitles$: Record<string, Subject<SubtitleMessage>> = {};

        const usersUpdated$ = new BehaviorSubject<boolean>(true);
        const wothMessage$ = socketMessages<SocketMessageData.Woth>("woth").pipe(share());
        const wothCounts$ = wothMessage$.pipe(
            map(woth => woth.counts)
        );
        const wothUpdated$ = wothMessage$.pipe(
            map(woth => woth.word),
            tap(word => {
                const wordElement = this.querySelector(".word");
                if (wordElement) wordElement.textContent = word;
                const wothElement = this.querySelector<HTMLElement>(".word-of-the-hour");
                if (wothElement) wothElement.dataset.state = word ? "show" : "hidden";
            })
        )
        const wothCountUpdates$ = combineLatest([wothCounts$, usersUpdated$]).pipe(
            map(([counts, i]) => counts),
            tap(counts => {
                for (let id in counts) {
                    const count = counts[id];
                    const element = this.getPersonElement(id);
                    if (element) {
                        const countElement = element.querySelector(".count");
                        if (Number(countElement.textContent) !== count) {
                            element.classList.remove("animation");
                            element.offsetWidth;
                            element.classList.add("animation");
                            countElement.textContent = count.toString();
                        }
                    }
                }
            })
        )
        merge(wothCountUpdates$, wothUpdated$).subscribe();

        socketMessages<SocketMessageData.Webcam>("webcam").subscribe(cam => {
            const webcam = this.querySelector<HTMLElement>(".webcam");
            webcam.style.setProperty("--left", cam.position[0].toString());
            webcam.style.setProperty("--top", cam.position[1].toString());
        });

        socketMessages<SocketMessageData.Voice>("voice").subscribe(data => {
            for (let el of document.querySelectorAll<HTMLElement>(".friend-list [data-person]")) {
                el.classList.toggle("speaking", data.users[el.dataset.discordId]);
            }
        });

        socketMessages<SocketMessageData.Subtitles>("subtitles").subscribe(subtitle => {
            subtitles$[subtitle.userId].next({
                id: subtitle.subtitleId,
                text: subtitle.text
            });
        });

        socketMessages<SocketMessageData.Users>("users").subscribe(users => {
            const friendList = document.querySelector(".friend-list");
            const elements = Array.from(friendList.querySelectorAll<HTMLElement>(`[data-person]`));
            for (let userId in users) {
                let user = users[userId];
                let element = elements.find(element => element.dataset.person == user.id);
                if (!element) {
                    element = document.createElement("li");
                    element.dataset.discordId = user.discordId;
                    element.dataset.person = userId;
                    element.innerHTML = `<div class="user">
                        <span class="name">${user.name}</span>
                        <span class="count">0</span>
                    </div>
                    <div class="speaker"></div>
                    <div class="subtitles"></div>`
                    friendList.appendChild(element);

                    const subtitlesElement = element.querySelector(".subtitles");
                    subtitles$[userId] = new Subject<SubtitleMessage>();
                    subtitles$[userId].pipe(
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
                } else {
                    const index = elements.indexOf(element);
                    if (index !== -1) {
                        elements.splice(index, 1);
                    }
                }
            }
            for (let element of elements) {
                element.remove();
            }
            usersUpdated$.next(true);
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

class Feed extends HTMLElement {
    connectedCallback() {
        const url$ = new BehaviorSubject<string | null>(null);
        socketMessages<SocketMessageData.FocusedFeed>("feed").subscribe(feed => {
            if (feed) {
                this.querySelector(".name").textContent = feed.user;
                url$.next(feed.url);
                this.style.setProperty("--aspect-ratio", feed.aspectRatio);
            } else {
                url$.next(null);
            }
        });

        const urlHandlers = [
            (url: string) => {
                const matches = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w\-]{10,12})\b/);
                const videoID = matches ? matches[1] : null;
                if (videoID) {
                    return `https://www.youtube.com/embed/${videoID}?autoplay=1`
                }
                return false;
            },
            (url: string) => {
                const urlObj = new URL(url);
                if (urlObj.hostname == "vdo.ninja") {
                    const params: Record<string, any> = {
                        bitrate: 5000,
                        codec: "av1",
                        speakermute: true,
                        ...Object.fromEntries(urlObj.searchParams),
                    }
                    for (let key in params) {
                        urlObj.searchParams.set(key, params[key].toString());
                    }
                    return urlObj.href;
                }
                return false;
            },
        ]

        url$.pipe(
            debounceTime(1000),
            distinctUntilChanged()
        ).subscribe(url => {
            const iframe = this.querySelector<HTMLIFrameElement>("iframe");
            this.classList.toggle("show", !!url);
            if (url) {
                for (const handler of urlHandlers) {
                    const newUrl = handler(url);
                    if (newUrl) {
                        url = newUrl;
                        break;
                    }
                }
                iframe.src = url;
            } else {
                iframe.src = "about:blank";
            }
        })
    }
}

customElements.define("x-app", App);
customElements.define("x-dashboard", Dashboard);
customElements.define("x-feed", Feed);