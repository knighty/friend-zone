import { BehaviorSubject, combineLatest, map, Observable, shareReplay, switchMap, timer } from "rxjs";
import { logger } from "shared/logger";
import { ObservableMap } from "shared/rx/observables/map";
import config from "../config";

type Feed = {
    user: string,
    aspectRatio: string,
    sourceAspectRatio: string,
    url: string,
    focused: Date | null;
    active: boolean,
}

const log = logger("feeds");
export default class ExternalFeeds {
    slideshowFrequency$ = new BehaviorSubject<number>(config.feeds.slideshowFrequency);
    feedCount$ = new BehaviorSubject<number>(config.feeds.count);
    feedSize$ = new BehaviorSubject<number>(config.feeds.size);
    feedPosition$ = new BehaviorSubject<[number, number]>(config.feeds.position);
    feedLayout$ = new BehaviorSubject<"row" | "column">(config.feeds.layout);
    private feeds = new ObservableMap<string, Feed>();
    private sortedFeeds$: Observable<Feed[]>;

    constructor() {
        const slideshowTimer$ = this.slideshowFrequency$.pipe(
            switchMap(frequency => {
                log.info(`Starting slideshow, changing every ${frequency}s`);
                return timer(0, frequency * 1000)
            })
        )
        this.sortedFeeds$ = combineLatest([this.feeds.values$, slideshowTimer$]).pipe(
            map(([feeds, timer]) => {
                const feedArray = Array.from(feeds.values());
                const sortedFeeds = feedArray.map((feed, i) => ({ feed, i: (i + timer) % feedArray.length })).toSorted((a, b) => {
                    if (a.feed.focused != b.feed.focused) {
                        return (b.feed.focused?.getTime() ?? 0) - (a.feed.focused?.getTime() ?? 0);
                    }
                    return a.i - b.i;
                }).map(o => o.feed);
                return sortedFeeds;
            }),
            shareReplay(1)
        )
    }

    observeFeeds(count: number = 3) {
        return this.sortedFeeds$.pipe(
            count === undefined ? undefined : map(feeds => feeds.slice(0, count))
        );
    }

    observeFeed() {
        return this.sortedFeeds$.pipe(
            map(feeds => feeds.length > 0 ? feeds[0] : null)
        );
    }

    updateFeed(user: string, feed: Partial<Feed>) {
        this.feeds.update(user, feed);
    }

    addFeed(feed: Feed) {
        this.feeds.set(feed.user, feed);
    }

    focusFeed(user: string, focus: boolean) {
        this.updateFeed(user, {
            focused: focus ? new Date() : null
        });
    }

    activeFeed(user: string, active: boolean) {
        this.updateFeed(user, {
            active: active
        });
    }

    removeFeed(user: string) {
        this.feeds.delete(user);
    }
}