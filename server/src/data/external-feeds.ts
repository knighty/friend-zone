import { combineLatest, distinctUntilChanged, map, merge, Observable, of, scan, shareReplay, Subject, switchMap, timer } from "rxjs";

type Feed = {
    user: string,
    url: string,
    focused: Date | null;
    active: boolean,
}

type FeedMap = Map<string, Feed>;

export class ExternalFeeds {
    addFeed$ = new Subject<Feed>();
    removeFeed$ = new Subject<string>();
    updateFeed$ = new Subject<Feed>();
    focusFeed$ = new Subject<{ user: string, focus: boolean }>();
    feeds$: Observable<Map<string, Feed>>;
    activeFeeds$: Observable<Feed[]>;
    focusedFeed$: Observable<Feed>;

    constructor() {
        this.feeds$ = merge(
            this.addFeed$.pipe(map(feed => (feeds: FeedMap) => feeds.set(feed.user, feed))),
            this.removeFeed$.pipe(map(user => (feeds: FeedMap) => feeds.delete(user))),
            this.updateFeed$.pipe(map(feed => (feeds: FeedMap) => feeds.set(feed.user, { ...feeds.get(feed.user), ...feed }))),
            this.focusFeed$.pipe(map(data => (feeds: FeedMap) => feeds.set(data.user, { ...feeds.get(data.user), focused: data.focus ? new Date() : null }))),
        ).pipe(
            scan((a, c) => (c(a), a), new Map<string, Feed>()),
            shareReplay(1)
        )
        this.feeds$.subscribe();

        const untilFeedChanged = () => distinctUntilChanged<Feed | null>((previous, next) => previous?.user == next?.user);

        this.activeFeeds$ = this.feeds$.pipe(
            map(feeds => Array.from(feeds.values()).filter(feed => feed.active)),
            shareReplay(1),
        )
        const slideshow$ = combineLatest([this.activeFeeds$, timer(0, 3 * 1000)]).pipe(
            map(([feeds, i]) => feeds[i % feeds.length]),
            untilFeedChanged(),
            shareReplay(1),
        );
        const focusedTime = (feed: Feed) => feed.focused ? feed.focused.getTime() : 0;
        const focused$ = this.activeFeeds$.pipe(
            map(feeds => feeds.filter(feed => feed.focused).toSorted((a, b) => focusedTime(a) - focusedTime(b))),
            map(feeds => (feeds.length > 0 ? feeds[0] : null)),
            untilFeedChanged()
        )
        this.focusedFeed$ = focused$.pipe(
            switchMap(focusedFeed => {
                if (focusedFeed) {
                    return of(focusedFeed)
                } else {
                    return slideshow$
                }
            }),
            shareReplay(1)
        )
    }

    addFeed(feed: Feed) {
        this.addFeed$.next(feed);
    }

    focusFeed(user: string, focus: boolean) {
        this.focusFeed$.next({ user, focus });
    }

    removeFeed(user: string) {
        this.removeFeed$.next(user);
    }
}