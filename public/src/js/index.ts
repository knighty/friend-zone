import { BehaviorSubject, combineLatest, debounceTime, delay, distinctUntilChanged, EMPTY, endWith, exhaustMap, filter, finalize, fromEvent, interval, map, merge, Observable, scan, share, startWith, Subject, switchMap, takeWhile, tap } from "rxjs";
import { createElement } from "shared/utils";
import { connectBrowserSocket } from "shared/websocket/browser";

type SubtitleMessage = {
    id: number,
    text: string
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
        aspectRatio: string,
        sourceAspectRatio: string,
    }
    export type FeedPosition = [number, number]
    export type FeedSize = number
}

const socket = connectBrowserSocket(document.body.dataset.socketUrl);
socket.isConnected$.subscribe(isConnected => document.body.classList.toggle("connected", isConnected));

class Webcam extends HTMLElement {
    connectedCallback() {
        socket.receive<SocketMessageData.Webcam>("webcam").subscribe(cam => {
            const webcam = this.querySelector<HTMLElement>(".webcam");
            webcam.style.setProperty("--left", cam.position[0].toString());
            webcam.style.setProperty("--top", cam.position[1].toString());
        });

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

class App extends HTMLElement {
    getPersonElement(id: string): HTMLElement {
        return document.querySelector(`.friend-list [data-person=${id}]`) as HTMLElement;
    }

    connectedCallback() {
        const subtitles$: Record<string, Subject<SubtitleMessage>> = {};

        const usersUpdated$ = new BehaviorSubject<boolean>(true);
        const wothMessage$ = socket.receive<SocketMessageData.Woth>("woth").pipe(share());
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

        socket.receive<SocketMessageData.Voice>("voice").subscribe(data => {
            for (let el of document.querySelectorAll<HTMLElement>(".friend-list [data-person]")) {
                el.classList.toggle("speaking", !!data.users[el.dataset.discordId]);
            }
        });

        socket.receive<SocketMessageData.Subtitles>("subtitles").subscribe(subtitle => {
            subtitles$[subtitle.userId].next({
                id: subtitle.subtitleId,
                text: subtitle.text
            });
        });

        socket.receive<SocketMessageData.Users>("users").subscribe(users => {
            const friendList = document.querySelector(".friend-list");
            const elements = Array.from(friendList.querySelectorAll<HTMLElement>(`[data-person]`));
            for (let userId in users) {
                let user = users[userId];
                let element = elements.find(element => element.dataset.person == userId.toLowerCase());
                if (!element) {
                    element = document.createElement("li");
                    element.dataset.discordId = user.discordId;
                    element.dataset.person = userId.toLowerCase();
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
    }
}

class Feed extends HTMLElement {
    connectedCallback() {
        socket.receive<SocketMessageData.FeedPosition>("feedPosition").subscribe(position => {
            this.style.setProperty("--left", position[0].toString());
            this.style.setProperty("--top", position[1].toString());
        });

        socket.receive<SocketMessageData.FeedPosition>("feedSize").subscribe(size => {
            this.style.setProperty("--size", size.toString());
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

        /*<div class="video-shadow"></div>
                <div class="video">
                    <iframe src="about:blank" allow="autoplay;"></iframe>
                </div>
                <span class="name">knighty</span>*/

        const feedItems$ = socket.receive<SocketMessageData.FocusedFeed>("feed").pipe(
            debounceTime(100),
        );

        type FeedItem = {
            url: string,
            user: string,
            feed: {
                observable: Observable<any>,
                setAspectRatio: (aspectRatio: string) => void,
                setSourceAspectRatio: (aspectRatio: string) => void,
            }
        }

        feedItems$.pipe(
            scan((a, feed) => {
                if (feed == null)
                    return null;

                for (const handler of urlHandlers) {
                    const newUrl = handler(feed.url);
                    if (newUrl) {
                        feed.url = newUrl;
                        break;
                    }
                }

                if (a?.url == feed.url) {
                    a.feed.setAspectRatio(feed.aspectRatio);
                    a.feed.setSourceAspectRatio(feed.sourceAspectRatio);
                    return a;
                } else {
                    const element = createElement("div", { classes: ["feed"] });
                    element.style.setProperty("--aspect-ratio", feed.aspectRatio);
                    element.style.setProperty("--source-aspect-ratio", feed.sourceAspectRatio);
                    element.innerHTML = `<div class="video-shadow"></div>
                    <div class="video">
                        <div class="video-container">
                            <iframe src="${feed.url}" allow="autoplay;"></iframe>
                        </div>
                    </div>
                    <span class="name">${feed.user}</span>`;

                    this.appendChild(element);
                    const observable$ = new Observable(subscriber => subscriber.next(element)).pipe(
                        tap(() => element.classList.add("show")),
                        finalize(() => {
                            element.classList.remove("show")
                            setTimeout(() => element.remove(), 1000);
                        })
                    );

                    return {
                        feed: {
                            observable: observable$,
                            setAspectRatio: (aspectRatio: string) => element.style.setProperty("--aspect-ratio", aspectRatio),
                            setSourceAspectRatio: (aspectRatio: string) => element.style.setProperty("--source-aspect-ratio", aspectRatio),
                        },
                        url: feed.url,
                        user: feed.user
                    }
                }
            }, null as FeedItem),
            map(feedItem => feedItem?.feed.observable),
            distinctUntilChanged(),
            delay(2000),
            switchMap(observable => observable ? observable : EMPTY)
        ).subscribe();


        /*feedItems$.subscribe(feed => {
            const iframe = this.querySelector<HTMLIFrameElement>("iframe");
            if (feed == null) {
                iframe.src = "about:blank";
                this.classList.toggle("show", false);
                return;
            }
            this.querySelector(".name").textContent = feed.user;
            this.style.setProperty("--aspect-ratio", feed.aspectRatio);
            this.classList.toggle("show", !!feed.url);
            for (const handler of urlHandlers) {
                const newUrl = handler(feed.url);
                if (newUrl) {
                    feed.url = newUrl;
                    break;
                }
            }
            iframe.src = feed.url;
            this.classList.toggle("show", true);
        })*/
    }
}

customElements.define("x-app", App);
customElements.define("x-feed", Feed);
customElements.define("x-webcam", Webcam);