import { BehaviorSubject, combineLatest, map, Observable, shareReplay, Subject, switchMap, timer } from "rxjs";
import { logger } from "shared/logger";
import { observableMap } from "shared/rxutils";
import config from "../config";

type Feed = {
    user: string,
    aspectRatio: string,
    sourceAspectRatio: string,
    url: string,
    focused: Date | null;
    active: boolean,
}

type FeedMap = Map<string, Feed>;

const log = logger("feeds");

export class ExternalFeeds {
    private addFeed$ = new Subject<{ key: string, value: Feed }>();
    private removeFeed$ = new Subject<string>();
    private updateFeed$ = new Subject<{ key: string, value: Partial<Feed> }>();
    private feeds$: Observable<Map<string, Feed>>;
    slideshowFrequency$ = new BehaviorSubject<number>(config.feeds.slideshowFrequency);
    feedCount$ = new BehaviorSubject<number>(config.feeds.count);
    feedSize$ = new BehaviorSubject<number>(config.feeds.size);
    feedPosition$ = new BehaviorSubject<[number, number]>(config.feeds.position);
    feedLayout$ = new BehaviorSubject<"row" | "column">(config.feeds.layout);
    private sortedFeeds$: Observable<Feed[]>;

    constructor() {
        this.feeds$ = observableMap<string, Feed>(this.addFeed$, this.removeFeed$, this.updateFeed$);
        this.feeds$.subscribe();

        const slideshowTimer$ = this.slideshowFrequency$.pipe(
            switchMap(frequency => {
                log.info(`Starting slideshow, changing every ${frequency}s`);
                return timer(0, frequency * 1000)
            })
        )
        this.sortedFeeds$ = combineLatest([this.feeds$, slideshowTimer$]).pipe(
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

    observeFeeds(count: number) {
        return this.sortedFeeds$.pipe(
            map(feeds => feeds.slice(0, count))
        );
    }

    observeFeed() {
        return this.sortedFeeds$.pipe(
            map(feeds => feeds.length > 0 ? feeds[0] : null)
        );
    }

    updateFeed(user: string, feed: Partial<Feed>) {
        this.updateFeed$.next({
            key: user,
            value: feed
        });
    }

    addFeed(feed: Feed) {
        this.addFeed$.next({
            key: feed.user,
            value: feed
        });
    }

    focusFeed(user: string, focus: boolean) {
        this.updateFeed$.next({
            key: user,
            value: {
                focused: focus ? new Date() : null
            }
        });
    }

    activeFeed(user: string, active: boolean) {
        this.updateFeed$.next({
            key: user,
            value: {
                active: active
            }
        });
    }

    removeFeed(user: string) {
        this.removeFeed$.next(user);
    }
}