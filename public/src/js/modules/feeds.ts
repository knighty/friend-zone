import { debounceTime, Observable, of, switchMap, tap } from "rxjs";
import { createElement } from "shared/utils";
import { socket } from "../socket";

namespace SocketMessageData {
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

export default class FeedsModule extends HTMLElement {
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

        const feedItems$ = socket.receive<SocketMessageData.FocusedFeed[]>("feed").pipe(
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

        const elements: Record<string, HTMLElement> = {};

        type FeedContainer = {
            rootElement: HTMLElement,
            element: HTMLElement,
            item: SocketMessageData.FocusedFeed,
            canAccept: (item: SocketMessageData.FocusedFeed) => boolean,
            accept: (item: SocketMessageData.FocusedFeed) => void,
        }
        const feedContainers$ = of([...Array(3)].map<FeedContainer>(i => {
            const rootElement = createElement("div", { classes: ["feed-container"] });
            return {
                item: null,
                rootElement: rootElement,
                element: null,
                canAccept(item) {
                    return item.user == this.item?.user;
                },
                accept(feed) {
                    if (this.item?.url == feed.url && this.item?.user == feed.user) {
                        this.element.style.setProperty("--aspect-ratio", feed.aspectRatio);
                        this.element.style.setProperty("--source-aspect-ratio", feed.sourceAspectRatio);
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

                        rootElement.appendChild(element);
                        const previousElement = this.element;
                        this.element = element;
                        setTimeout(() => {
                            if (previousElement != null) {
                                previousElement.classList.remove("show");
                                previousElement.remove();
                            }
                            element.classList.add("show");
                        }, 2000);
                        this.item = feed;
                    }
                },
            };
        }));

        feedContainers$.pipe(
            switchMap(containers => {
                for (let container of containers) {
                    this.appendChild(container.rootElement);
                }
                return feedItems$.pipe(
                    tap(feeds => {
                        for (let feed of feeds) {
                            for (const handler of urlHandlers) {
                                const newUrl = handler(feed.url);
                                if (newUrl) {
                                    feed.url = newUrl;
                                    break;
                                }
                            }
                        }

                        const remainingContainers = Array.from(containers);
                        console.log(remainingContainers);
                        const remainingFeeds = Array.from(feeds);

                        // First try and match up existing feeds
                        let handledFeeds = [];
                        for (let feed of remainingFeeds) {
                            for (let container of remainingContainers) {
                                if (container.canAccept(feed)) {
                                    console.log(`Found existing slot for ${feed.user}`);
                                    remainingContainers.splice(remainingContainers.indexOf(container), 1);
                                    container.accept(feed);
                                    handledFeeds.push(feed);
                                    break;
                                }
                            }
                        }
                        for (let feed of handledFeeds) {
                            remainingFeeds.splice(remainingFeeds.indexOf(feed), 1);
                        }

                        //Handle the rest
                        for (let feed of remainingFeeds) {
                            console.log(`Finding slot for ${feed.user}`);
                            const container = remainingContainers.pop();
                            if (!container) {
                                console.log("didn't find a container");
                                break;
                            }
                            container.accept(feed);
                        }
                    })
                )
            })
        ).subscribe();
    }
}