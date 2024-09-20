import { debounceTime, first, of, Subscription, switchMap, tap } from "rxjs";
import { createElement } from "shared/utils";
import { socket } from "../../socket";
import { Embed } from "./embed-handlers/embed-handler";
import { handleEmbed } from "./embed-handlers/embed-handlers";

const audioEnabled = false;

namespace Message {
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
    export type FeedLayout = "row" | "column";
}

type FeedContainer = {
    toggleVisibility: (visible: boolean) => void,
    canAccept: (item: Message.FocusedFeed) => boolean,
    accept: (item: Message.FocusedFeed) => Embed,
    hasAudio: () => boolean;
    toggleAudio: (audio: boolean) => void;
}

const isFirst = (feed: Message.FocusedFeed, feeds: Message.FocusedFeed[]) => feeds[0] == feed;

export default class FeedsModule extends HTMLElement {
    connectedCallback() {
        socket.receive<Message.FeedPosition>("feedPosition").subscribe(position => {
            this.style.setProperty("--left", position[0].toString());
            this.style.setProperty("--top", position[1].toString());
        });

        socket.receive<Message.FeedPosition>("feedSize").subscribe(size => {
            this.style.setProperty("--size", size.toString());
        });

        socket.receive<Message.FeedLayout>("feedLayout").subscribe(layout => {
            this.dataset.orientation = layout;
        });

        const feedItems$ = socket.receive<Message.FocusedFeed[]>("feed").pipe(
            debounceTime(100),
        );

        const feedContainers$ = of([...Array(3)].map<FeedContainer>(i => {
            const rootElement = createElement("div", { classes: ["feed-container"] });
            let element: HTMLElement = null;
            let item: Message.FocusedFeed = null;
            let wasVisible = false;
            let subscription: Subscription = null;
            let currentEmbed: Embed = null;

            return {
                canAccept(feed) {
                    return feed.user == item?.user;
                },
                accept(feed) {
                    const isSame = item?.url == feed.url && item?.user == feed.user;
                    if (!isSame) {
                        if (currentEmbed && currentEmbed.unload)
                            currentEmbed.unload();
                        const previousElement = element;
                        element = createElement("div", { classes: ["feed"] });

                        element.innerHTML = `<div class="video-shadow"></div>
                        <div class="video">
                            <div class="video-container"></div>
                        </div>
                        <span class="name">${feed.user}</span>`;
                        rootElement.appendChild(element);

                        const embed = handleEmbed(feed.url, element.querySelector(".video-container"));
                        currentEmbed = typeof embed == "boolean" ? null : embed;

                        if (subscription) {
                            subscription.unsubscribe();
                        }
                        subscription = (typeof embed == "boolean" ? of(0) : embed.loaded).pipe(first()).subscribe(() => {
                            if (previousElement != null) {
                                previousElement.classList.remove("show");
                                previousElement.remove();
                            }
                            element.classList.add("show");
                        });
                        item = feed;
                    }
                    rootElement.style.setProperty("--aspect-ratio", feed.aspectRatio);
                    rootElement.style.setProperty("--source-aspect-ratio", feed.sourceAspectRatio);
                    return currentEmbed;
                },
                toggleVisibility: (visible: boolean) => {
                    rootElement.classList.toggle("show", visible);
                    if (visible && !wasVisible) {
                        this.appendChild(rootElement);
                    } else if (!visible && wasVisible) {
                        this.removeChild(rootElement);
                    }
                    wasVisible = visible;
                },
                hasAudio: () => currentEmbed?.hasAudio ?? false,
                toggleAudio(audio) {
                    currentEmbed?.toggleAudio(audio);
                }
            };
        }));

        feedContainers$.pipe(
            switchMap(containers => {
                return feedItems$.pipe(
                    tap(feeds => {
                        const usedContainers = [];
                        const remainingContainers = Array.from(containers);
                        const activeFeeds = feeds.filter(feed => feed.focused || feed.active);

                        // Match up feeds that have existing containers
                        const remainingFeeds = activeFeeds.reduce((a, feed) => {
                            for (let container of remainingContainers) {
                                if (container.canAccept(feed)) {
                                    remainingContainers.splice(remainingContainers.indexOf(container), 1);
                                    const embed = container.accept(feed);
                                    container.toggleVisibility(true);
                                    usedContainers.push(container);
                                    return a;
                                }
                            }
                            a.push(feed);
                            return a;
                        }, [])

                        // Handle the rest
                        for (let feed of remainingFeeds) {
                            const container = remainingContainers.pop();
                            if (!container) {
                                break;
                            }
                            const embed = container.accept(feed);
                            container.toggleVisibility(true);
                            usedContainers.push(container);
                        }

                        // Enable audio for first valid feed
                        if (audioEnabled) {
                            let audioOn = true;
                            for (let container of usedContainers) {
                                if (audioOn && container.hasAudio()) {
                                    container.toggleAudio(true);
                                    audioOn = false;
                                } else {
                                    container.toggleAudio(false);
                                }
                            }
                        }

                        // Any remaining containers should be hidden
                        for (let container of remainingContainers) {
                            container.toggleVisibility(false);
                        }
                    })
                )
            })
        ).subscribe();
    }
}