import { FastifyInstance } from "fastify";
import { BehaviorSubject, catchError, EMPTY, fromEvent, ignoreElements, interval, map, merge, Observable, of, switchMap, takeUntil, tap } from "rxjs";
import { ExternalFeeds } from "../data/external-feeds";
import Subtitles from "../data/subtitles";
import { Users } from "../data/users";
import { log } from "../lib/logger";

type WebsocketMessageStream = Observable<{
    type: string,
    data: object | string
}>

export const remoteControlSocket = (subtitles: Subtitles, feeds: ExternalFeeds, users: Users) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/remote-control/websocket', { websocket: true }, (socket, req) => {
        let userId: string | undefined;
        function send(type: string, data: object | string) {
            socket.send(JSON.stringify({
                type: type,
                data: data
            }));
        }

        const feed$ = new BehaviorSubject<{ url: string, aspectRatio: string } | null>(null);
        const feedActive$ = new BehaviorSubject(false);

        const feedObservable$ = feed$.pipe(
            switchMap(feed => of(feed).pipe(map(feed => ({ url: new URL(feed.url), aspectRatio: feed.aspectRatio })), catchError(e => EMPTY))),
            tap(feed => {
                feeds.addFeed({
                    user: userId,
                    focused: null,
                    active: true,
                    aspectRatio: feed.aspectRatio,
                    url: feed.url.href
                });
                feeds.updateFeed(userId, {
                    aspectRatio: feed.aspectRatio,
                    url: feed.url.href
                })
            }),
            switchMap(url => feedActive$.pipe(
                tap(active => feeds.activeFeed(userId, active))
            ))
        );

        socket.on("message", (raw: any) => {
            const message = JSON.parse(raw);
            console.log(message);
            const data = message.data;
            switch (message.type) {
                case "user": {
                    userId = data.id;
                    users.addPerson(data.discordId, data.name);
                } break;
                case "subtitles": {
                    subtitles.handle(userId, data.id, data.type, data.text);
                } break;
                case "feed/register": {
                    feed$.next(data);
                } break;
                case "feed/focus": {
                    feeds.focusFeed(userId, true);
                } break;
                case "feed/active": {
                    feedActive$.next(data.isActive);
                } break;
                case "feed/unfocus": {
                    feeds.focusFeed(userId, false);
                } break;
            }
        });

        socket.on("close", () => {
            feeds.removeFeed(userId);
            users.removePerson(userId);
        })

        log.info("Opening web socket", "websocket");

        const ping$ = interval(30 * 1000).pipe(
            tap(i => socket.ping()),
        );

        merge(
            feedObservable$,
            ping$

        ).pipe(
            ignoreElements(),
            takeUntil(fromEvent(socket, "close"))
        ).subscribe({
            complete: () => {
                log.info("Closing web socket", "websocket");
            }
        });
    })
}