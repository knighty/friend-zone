import { BehaviorSubject, combineLatest, map, merge, Observable, scan, shareReplay, Subject, switchMap, timer } from "rxjs";
import { logger } from "shared/logger";

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
    private addFeed$ = new Subject<Feed>();
    private removeFeed$ = new Subject<string>();
    private updateFeed$ = new Subject<Partial<Feed>>();
    private focusFeed$ = new Subject<{ user: string, focus: boolean }>();
    private activeFeed$ = new Subject<{ user: string, active: boolean }>();
    private feeds$: Observable<Map<string, Feed>>;
    slideshowFrequency$ = new BehaviorSubject<number>(30);
    feedCount$ = new BehaviorSubject<number>(1);
    feedSize$ = new BehaviorSubject<number>(30);
    feedPosition$ = new BehaviorSubject<[number, number]>([0, 0.5]);
    feedLayout$ = new BehaviorSubject<"row" | "column">("row");
    private sortedFeeds$: Observable<Feed[]>;

    constructor() {
        this.feeds$ = merge(
            this.addFeed$.pipe(map(feed => (feeds: FeedMap) => feeds.get(feed.user) ? null : feeds.set(feed.user, feed))),
            this.removeFeed$.pipe(map(user => (feeds: FeedMap) => feeds.delete(user))),
            this.updateFeed$.pipe(map(data => (feeds: FeedMap) => {
                if (feeds.get(data.user))
                    feeds.set(data.user, { ...feeds.get(data.user), ...data })
            })),
            this.focusFeed$.pipe(map(data => (feeds: FeedMap) => {
                if (feeds.get(data.user))
                    feeds.set(data.user, { ...feeds.get(data.user), focused: data.focus ? new Date() : null })
            })),
            this.activeFeed$.pipe(map(data => (feeds: FeedMap) => {
                if (feeds.get(data.user))
                    feeds.set(data.user, { ...feeds.get(data.user), active: data.active })
            })),
        ).pipe(
            scan((a, c) => (c(a), a), new Map<string, Feed>()),
            shareReplay(1)
        )
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
            user: user,
            ...feed
        });
    }

    addFeed(feed: Feed) {
        this.addFeed$.next(feed);
    }

    focusFeed(user: string, focus: boolean) {
        this.focusFeed$.next({ user, focus });
    }

    activeFeed(user: string, active: boolean) {
        this.activeFeed$.next({ user, active });
    }

    removeFeed(user: string) {
        this.removeFeed$.next(user);
    }
}