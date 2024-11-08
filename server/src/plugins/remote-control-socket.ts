import { FastifyInstance } from "fastify";
import fs from "fs/promises";
import { green } from "kolorist";
import path from "path";
import { concatMap, distinctUntilChanged, EMPTY, filter, finalize, map, merge, Observable, of, shareReplay, switchMap, take, takeUntil, tap } from "rxjs";
import { logger } from "shared/logger";
import { switchMapComplete } from "shared/rx";
import { randomString } from "shared/text-utils";
import { ObservableEventProvider, serverSocket } from "shared/websocket/server";
import ExternalFeeds from "../data/external-feeds";
import { Stream } from "../data/stream";
import Subtitles from "../data/subtitles";
import Users from "../data/users";
import { Mippy } from "../mippy/mippy";
import { ScreenshotRepository } from "../mippy/plugins/plugins/screenshot";

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
    } | null

    export type Screen = {
        data: string;
    }
}

const downloadDir = path.join(__dirname, `../../../public/downloads/images/`);

async function imageToFile(buffer: Buffer) {
    const filename = `${randomString(20)}.jpg`;
    await fs.writeFile(path.join(downloadDir, filename), buffer);
    log.info(`Downloaded file to ${green(filename)}`);
    return filename;
}

export const remoteControlSocket = (subtitles: Subtitles, feeds: ExternalFeeds, users: Users, mippy: Mippy, screenshotRepository: ScreenshotRepository, stream: Stream) => async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/remote-control/websocket', { websocket: true }, (ws, req) => {
        let socket = serverSocket<{
            Events: {
                "user": Messages.User,
                "subtitles": Messages.Subtitles,
                "feed/focus": void,
                "feed/unfocus": void,
                "feed/register": Messages.RegisterFeed,
                "mippy/ask": {
                    text: string,
                    image?: string
                },
                "mippy/say": string,
                "screen": Messages.Screen
            }
        }>(ws, new ObservableEventProvider({
            subtitles: of({ enabled: true })
        }), {
            url: req.url
        });

        socket.on("user", true).pipe(
            take(1),
            switchMap(([user, callback]) => {
                return new Observable(subscriber => {
                    const userId = user.id;
                    const userName = user.name;
                    const feed$ = socket.on("feed/register").pipe(shareReplay(1));
                    const feedFocused$ = merge(
                        socket.on("feed/focus").pipe(map(() => true)),
                        socket.on("feed/unfocus").pipe(map(() => false)),
                    ).pipe(shareReplay(1));

                    log.info(`${green(user.name)} registered`);
                    const userRegistration = users.register(userId, user);
                    callback({ message: `You were successfully registered with id ${userId}` })

                    socket.on("subtitles").pipe(
                        stream.doWhenLive()
                    ).subscribe(data => {
                        subtitles.handle(userId, data.id, data.type, data.text);
                    });

                    socket.on("mippy/ask").pipe(
                        stream.doWhenLive(),
                        concatMap(async question => {
                            if (question.image) {
                                const filename = `${randomString(20)}.jpg`;
                                const data = Buffer.from(question.image, "binary");
                                return {
                                    text: question.text,
                                    image: screenshotRepository.add(filename, data)
                                }
                            }
                            return {
                                text: question.text
                            }
                        })
                    ).subscribe(question => {
                        const image = question.image ? [question.image] : undefined;
                        mippy.ask("question", {
                            question: question.text,
                            user: userName
                        }, {
                            source: "admin",
                            name: userName,
                            allowTools: true,
                            image
                        });
                    })

                    socket.on("mippy/say").subscribe(message => mippy.say(message))

                    let i = 0;
                    const screenGrabsSubscription = users.requestScreenGrab$.pipe(
                        filter(user => user.id == userId),
                        switchMapComplete(user => {
                            i++;
                            return socket.send<{ data: string }>("getScreen", {}, true).pipe(
                                tap(data => {
                                    if (!data)
                                        return;
                                    users.screenGrabs$.next({
                                        id: i,
                                        screen: Buffer.from(data.data, "binary"),
                                        user: user
                                    })
                                })
                            );
                        })
                    ).subscribe()

                    /*const feedData$ = combineLatest([
                        feed$.pipe(filter(feed => feed != null)),
                        feedFocused$.pipe(map(focus => ({
                            focused: focus ? new Date() : null
                        })))
                    ]).pipe(
                        map(([a, b]) => ({ ...a, ...b }))
                    )

                    const feedActive$ =  feed$.pipe(
                        map(feed => feed != null),
                        distinctUntilChanged()
                    );

                    feedData$.subscribe()*/

                    return feed$.pipe(
                        map(feed => feed != null),
                        distinctUntilChanged(),
                        switchMapComplete(active => {
                            if (!active) {
                                return EMPTY;
                            }

                            let feedRegistration: ReturnType<ExternalFeeds["addFeed"]> | null = null;
                            return merge(
                                feed$.pipe(
                                    filter(feed => !!feed),
                                    tap(feed => {
                                        try {
                                            const url = new URL(feed.url);
                                            const feedData = {
                                                aspectRatio: feed.aspectRatio,
                                                sourceAspectRatio: feed.sourceAspectRatio,
                                                url: url.href
                                            };
                                            log.info(`${green(userName)} set their feed to ${green(url.href)}`);
                                            if (feedRegistration == null) {
                                                feedRegistration = feeds.addFeed({
                                                    user: userId,
                                                    focused: null,
                                                    active: true,
                                                    ...feedData
                                                });
                                            } else {
                                                feeds.updateFeed(userId, feedData);
                                            }
                                        } catch (e) {
                                            log.error("Invalid Feed URL");
                                        }
                                    }),
                                    finalize(() => {
                                        if (feedRegistration) {
                                            log.info(`${green(userName)} removed their feed`);
                                            feedRegistration.unregister();
                                        }
                                    })
                                ),
                                feedFocused$.pipe(
                                    tap(focused => {
                                        feeds.focusFeed(userId, focused);
                                    })
                                )
                            )
                        }),
                        finalize(() => {
                            userRegistration.unregister();
                            screenGrabsSubscription.unsubscribe();
                            log.info(`${userName} unregistered`);
                        })
                    ).subscribe();
                })
            }),
            takeUntil(socket.disconnected$)
        ).subscribe();
    })
}