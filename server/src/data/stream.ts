import { BehaviorSubject, EMPTY, Observable, concat, defer, distinctUntilChanged, filter, map, shareReplay, skip, switchMap } from "rxjs";
import { StreamEventWatcher } from "./stream-event-watcher";
import { getCategoryStreamsInfo, getStream } from "./twitch/api";
import { getChatSettings } from "./twitch/api/chat";
import { AuthTokenSource } from "./twitch/auth-tokens";

export class Stream {
    isLive$ = new BehaviorSubject(true);

    setLiveStatus() {

    }

    doWhenLive<T>() {
        return (source: Observable<T>) => source.pipe(filter<T>(() => this.isLive$.value));
        /*return (source: Observable<T>) => source.pipe(
            withLatestFrom(this.isLive),
            filter(([data, isLive]) => isLive),
            map(([data, isLive]) => data)
        );*/
    }

    whenLive<T>(observable: Observable<T>): Observable<T> {
        return this.isLive$.pipe(
            switchMap(isLive => isLive ? observable : EMPTY)
        );
    }
}

export class StreamProperties {
    streamEventsWatcher: StreamEventWatcher;
    authToken: AuthTokenSource;
    userId: string;

    title: Observable<string>;
    category: Observable<{
        id: string,
        name: string,
        viewers: number
    }>;
    emojiOnlyMode: Observable<boolean>;

    constructor(authToken: AuthTokenSource, userId: string, streamEventsWatcher: StreamEventWatcher) {
        this.streamEventsWatcher = streamEventsWatcher;
        this.authToken = authToken;
        this.userId = userId;

        const streamInfo = concat(
            defer(() => getStream(this.authToken, Number(this.userId))).pipe(
                filter(stream => stream !== undefined),
                map(info => ({
                    title: info.title,
                    category: info.game_name,
                    categoryId: info.game_id,
                }))
            ),
            this.streamEventsWatcher.onEvent("channel.update", { broadcaster_user_id: this.userId }).pipe(
                map(info => ({
                    title: info.title,
                    category: info.category_name,
                    categoryId: info.category_id
                }))
            )
        ).pipe(
            shareReplay(1)
        );

        this.category = streamInfo.pipe(
            switchMap(info => defer(() => getCategoryStreamsInfo(authToken, info.categoryId)).pipe(
                map(data => ({
                    id: info.categoryId,
                    name: info.category,
                    viewers: data.viewers
                }))
            )),
        )

        this.title = streamInfo.pipe(
            map(info => info.title),

        )

        this.emojiOnlyMode = concat(
            defer(() => getChatSettings(authToken, userId)).pipe(
                map(settings => settings.emote_mode)
            ),
            streamEventsWatcher.onEvent("channel.chat_settings.update", {
                broadcaster_user_id: userId,
                user_id: userId
            }).pipe(
                map(e => e.emote_mode)
            )
        ).pipe(
            distinctUntilChanged(),
            skip(1),
            shareReplay(1)
        );
    }
}