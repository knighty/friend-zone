import { FastifyInstance } from "fastify";
import { green } from "kolorist";
import { BehaviorSubject, catchError, EMPTY, map, Observable, of, Subject, switchMap, take, tap } from "rxjs";
import { logger } from "shared/logger";
import { ObservableEventProvider, serverSocket } from "shared/websocket/server";
import ExternalFeeds from "../data/external-feeds";
import Subtitles from "../data/subtitles";
import Users from "../data/users";
import { Mippy } from "../mippy/mippy";

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
        discordId: string,
        prompt: string
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

export const remoteControlSocket = (subtitles: Subtitles, feeds: ExternalFeeds, users: Users, mippy: Mippy) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/remote-control/websocket', { websocket: true }, (ws, req) => {
        let socket = serverSocket<{
            Events: {
                "user": Messages.User,
                "subtitles": Messages.Subtitles,
                "feed/focus": void,
                "feed/unfocus": void,
                "feed/register": Messages.RegisterFeed,
                "feed/active": Messages.Active,
                "mippy/ask": string
            }
        }>(ws, new ObservableEventProvider({
            subtitles: of({ enabled: true })
        }));

        socket.on("user", true).pipe(
            take(1),
            switchMap(([user, callback]) => {
                return new Observable(subscriber => {
                    const userId = user.id;
                    const userName = user.name;
                    const feedActive$ = new BehaviorSubject(false);
                    const feed$ = new Subject<{ url: string, aspectRatio: string, sourceAspectRatio: string }>();

                    log.info(`${green(user.name)} registered`);
                    users.add(userId, user);
                    callback({ message: `You were successfully registered with id ${userId}` })

                    socket.on("subtitles").subscribe(data => {
                        subtitles.handle(userId, data.id, data.type, data.text);
                    });

                    socket.on("feed/register").subscribe(data => {
                        if (data) {
                            log.info(`${green(userName)} set their feed to ${green(data.url)} (${data.aspectRatio})`);
                        } else {
                            log.info(`${green(userName)} set their feed to empty`);
                        }
                        feed$.next(data);
                    });

                    socket.on("feed/focus").subscribe(data => {
                        feeds.focusFeed(userId, true);
                        log.info(`${green(userName)} focused their feed`);
                    });

                    socket.on("feed/unfocus").subscribe(data => {
                        feeds.focusFeed(userId, false);
                        log.info(`${green(userName)} unfocused their feed`);
                    });

                    socket.on("feed/active").subscribe(active => {
                        feedActive$.next(active);
                        log.info(`${green(userName)} is now ${green(active ? "active" : "inactive")}`);
                    });

                    socket.on("mippy/ask").subscribe(question => {
                        mippy.ask("question", { question, user: userName }, { source: "admin", name: userName });
                        //mippy.say(question)
                    })

                    const feedSubscription = feed$.pipe(
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
                    ).subscribe();

                    return () => {
                        feeds.removeFeed(userId);
                        users.remove(userId);
                        log.info(`${userName} unregistered`);
                        feedSubscription.unsubscribe()
                    }
                })
            })
        ).subscribe();
    })
}