import { FastifyInstance } from "fastify";
import { Observable, Subject } from "rxjs";
import { log } from "shared/logger";
import { InferObservable } from "shared/rx";
import { ObservableEventProvider, serverSocket } from "shared/websocket/server";
import ExternalFeeds from "../data/external-feeds";
import { Stream } from "../data/stream";
import { Mippy } from "../mippy/mippy";
import { WebsocketEvent } from "./socket";

type Events<T extends Record<string, (d: any) => void>> = {
    [K in keyof T]: Parameters<T[K]>[0]
}

export function configSocket(events: WebsocketEvent[], feeds: ExternalFeeds, sayGoodbye: Subject<void>, mippy: Mippy, stream: Stream) {
    function observableReceiver<T extends Subject<any>, U extends InferObservable<T>>(subject: T) {
        return (data: U) => subject.next(data);
    }
    const receivers = {
        "config/slideshowFrequency": observableReceiver(feeds.slideshowFrequency$),
        "config/feedPosition": observableReceiver(feeds.feedPosition$),
        "config/feedSize": observableReceiver(feeds.feedSize$),
        "config/feedLayout": observableReceiver(feeds.feedLayout$),
        "config/feedCount": observableReceiver(feeds.feedCount$),
        "config/isLive": observableReceiver(stream.isLive$)
    };
    type Receivers = typeof receivers;
    type E = Events<Receivers>;

    return async (fastify: FastifyInstance, options: {}) => {
        fastify.get('/websocket', { websocket: true }, (ws, req) => {
            let socket = serverSocket(ws, new ObservableEventProvider(
                events.reduce((a, stream) => {
                    a[stream.type] = stream.data
                    return a;
                }, {} as Record<string, Observable<any>>)
            ), {
                url: req.url
            });

            function hook<Key extends keyof Receivers>(key: Key) {
                // This is some really bad abuse of lack of type inference
                // Not sure how to improve this
                const receiver = receivers[key] as (data: E[Key]) => void;
                socket.on<E[Key]>(key).subscribe(receiver);
            }
            for (let key in receivers) {
                const k = key as keyof Receivers;
                hook(k);
            }

            socket.on<void>("sayGoodbye").subscribe(() => {
                sayGoodbye.next();
            })

            socket.on<{
                plugin: string,
                item: string,
                value: any
            }>("mippy/plugin/config").subscribe(data => {
                const plugin = mippy.plugins[data.plugin];
                if (!plugin) {
                    log.error(`Tried to set value of plugin ${data.plugin} but it doesn't exist. Possibly not loaded`);
                }
                plugin.config.setValue(data.item, data.value);
            })
        })
    }
}