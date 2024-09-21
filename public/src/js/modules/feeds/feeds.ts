import { debounceTime, scan, shareReplay, switchMap, tap } from "rxjs";
import { socket } from "../../socket";
import FeedContainer from "./container";

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
    export type FeedCount = number
    export type FeedLayout = "row" | "column";
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
            shareReplay(1),
        );
        feedItems$.subscribe();

        const feedCount$ = socket.receive<Message.FeedCount>("feedCount");

        const feedContainers$ = feedCount$.pipe(
            scan((state, num) => {
                for (let container of state.slice(num)) {
                    container.remove();
                }
                state = state.slice(0, num);
                for (let i = state.length; i < num; i++) {
                    state.push(new FeedContainer())
                }
                return state;
            }, [] as FeedContainer[])
        );

        feedContainers$.pipe(
            switchMap(containers => {
                console.log(containers);
                return feedItems$.pipe(
                    tap(feeds => {
                        const usedContainers = [];
                        const remainingContainers = Array.from(containers);
                        const activeFeeds = feeds.filter(feed => feed.focused || feed.active).slice(0, containers.length);

                        // Match up feeds that have existing containers
                        const remainingFeeds = activeFeeds.reduce((a, feed) => {
                            for (let container of remainingContainers) {
                                if (container.canAccept(feed)) {
                                    remainingContainers.splice(remainingContainers.indexOf(container), 1);
                                    container.accept(feed);
                                    container.toggleVisibility(true, this);
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
                            container.accept(feed);
                            container.toggleVisibility(true, this);
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
                            container.toggleVisibility(false, this);
                        }
                    })
                )
            })
        ).subscribe();
    }
}