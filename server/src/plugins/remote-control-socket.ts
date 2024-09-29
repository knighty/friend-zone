import { FastifyInstance } from "fastify";
import { BehaviorSubject, catchError, EMPTY, map, Observable, of, switchMap, takeUntil, tap } from "rxjs";
import { logger } from "shared/logger";
import { ObservableEventProvider, serverSocket } from "shared/websocket/server";
import { ExternalFeeds } from "../data/external-feeds";
import Subtitles from "../data/subtitles";
import { Users } from "../data/users";

type WebsocketMessageStream = Observable<{
    type: string,
    data: object | string
}>

const log = logger("remote-control");

namespace Messages {
    export type User = {
        id: string,
        name: string,
        sortKey: number,
        discordId: string
    }

    export type Subtitles = {
        id: number,
        type: "interim" | "final",
        text: string
    }

    export type RegisterFeed = {
        url: string;
        aspectRatio: string,
        sourceAspectRatio: string
    }

    export type Active = boolean
}

export const remoteControlSocket = (subtitles: Subtitles, feeds: ExternalFeeds, users: Users) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/remote-control/websocket', { websocket: true }, (ws, req) => {
        let userId: string | undefined;
        let userName: string | undefined;

        let socket = serverSocket<{
            Events: {
                "user": Messages.User,
                "subtitles": Messages.Subtitles,
                "feed/focus": void,
                "feed/unfocus": void,
                "feed/register": Messages.RegisterFeed,
                "feed/active": Messages.Active
            }
        }>(ws, new ObservableEventProvider({
            subtitles: of({ enabled: true })
        }));

        const feed$ = new BehaviorSubject<{ url: string, aspectRatio: string, sourceAspectRatio: string } | null>(null);
        const feedActive$ = new BehaviorSubject(false);

        const feedObservable$ = feed$.pipe(
            switchMap(feed => of(feed).pipe(map(feed => ({ url: new URL(feed.url), aspectRatio: feed.aspectRatio, sourceAspectRatio: feed.sourceAspectRatio })), catchError(e => EMPTY))),
            tap(feed => {
                feeds.addFeed({
                    user: userId,
                    focused: null,
                    active: true,
                    aspectRatio: feed.aspectRatio,
                    sourceAspectRatio: feed.sourceAspectRatio,
                    url: feed.url.href
                });
                feeds.updateFeed(userId, {
                    aspectRatio: feed.aspectRatio,
                    sourceAspectRatio: feed.sourceAspectRatio,
                    url: feed.url.href
                })
            }),
            switchMap(url => feedActive$.pipe(
                tap(active => feeds.activeFeed(userId, active))
            ))
        );

        socket.on("user", true).subscribe(([user, callback]) => {
            userId = user.id;
            userName = user.name;
            log.info(`${user.name} registered`);
            users.add(userId, user);
            callback({ message: `You were successfully registered with id ${userId}` })
        });

        socket.on("subtitles").subscribe(data => {
            subtitles.handle(userId, data.id, data.type, data.text);
        });

        socket.on("feed/register").subscribe(data => {
            if (data) {
                log.info(`${userName} set their feed to ${data.url} (${data.aspectRatio})`);
            } else {
                log.info(`${userName} set their feed to empty`);
            }
            feed$.next(data);
        });

        socket.on("feed/focus").subscribe(data => {
            feeds.focusFeed(userId, true);
            log.info(`${userName} focused their feed`);
        });

        socket.on("feed/unfocus").subscribe(data => {
            feeds.focusFeed(userId, false);
            log.info(`${userName} unfocused their feed`);
        });

        socket.on("feed/active").subscribe(active => {
            feedActive$.next(active);
            log.info(`${userName} is now ${active ? "active" : "inactive"}`);
        });

        function disconnect() {
            feeds.removeFeed(userId);
            users.remove(userId);
            log.info(`${userName} disconnected`);
        }
        socket.connection$.subscribe({
            complete: disconnect,
            error: disconnect
        });

        feedObservable$.pipe(
            takeUntil(socket.disconnected$)
        ).subscribe();
    })
}