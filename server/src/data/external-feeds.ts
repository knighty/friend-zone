import { combineLatest, distinctUntilChanged, map, merge, Observable, of, scan, shareReplay, Subject, switchMap, timer } from "rxjs";

type Feed = {
    user: string,
    aspectRatio: string,
    url: string,
    focused: Date | null;
    active: boolean,
}

type FeedMap = Map<string, Feed>;

export class ExternalFeeds {
    addFeed$ = new Subject<Feed>();
    removeFeed$ = new Subject<string>();
    updateFeed$ = new Subject<Partial<Feed>>();
    focusFeed$ = new Subject<{ user: string, focus: boolean }>();
    activeFeed$ = new Subject<{ user: string, active: boolean }>();
    feeds$: Observable<Map<string, Feed>>;
    activeFeeds$: Observable<Feed[]>;
    focusedFeed$: Observable<Feed>;

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

        const untilFeedChanged = () => distinctUntilChanged<Feed | null>((previous, next) => previous == next);

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
        const focused$ = this.feeds$.pipe(
            map(feeds => Array.from(feeds.values()).filter(feed => feed.focused).toSorted((a, b) => focusedTime(a) - focusedTime(b))),
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