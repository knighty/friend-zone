import { filter, first, fromEvent, map, Observable, share, shareReplay, tap } from "rxjs";
import { logger } from "shared/logger";
import { switchMapComplete } from "shared/rx/operators/switch-map-complete";
import { WebSocket } from "ws";
import { eventSub, eventUnsub, unsubscribeDisconnected } from "./api";
import { UserAuthTokenSource } from "./auth-tokens";

type SocketMessage<T = any> = {
    metadata: {
        message_id: string,
        message_type: string,
        message_timestamp: string,
        subscription_type: string
    },
    payload: T
}

type SessionWelcome = {
    session: {
        id: string,
        status: string,
        connected_at: string,
        keepalive_timeout_seconds: number,
        reconnect_url: null
    }
}

type SubscriptionPayload<Condition> = {
    type: string,
    version: string,
    condition: Condition & {
        transport: {
            session_id: string
        }
    }
}

const log = logger("twitch-api-socket");
export function twitchSocket(authTokenSource: UserAuthTokenSource, url = "wss://eventsub.wss.twitch.tv/ws") {
    const clientConnection$ = new Observable<WebSocket>(subscriber => {
        const ws = new WebSocket(url);
        log.info(`Connecting to ${url}...`);
        function error(e: Error) {
            log.error(`Socket closed: ${e.message}`);
            subscriber.error(e);
        };
        function open(e: any) {
            log.info("Socket open");
            unsubscribeDisconnected(authTokenSource);
            subscriber.next(ws);
        }
        function close(code: number, reason: Buffer) {
            log.info(`Socket closed (${code} - ${reason.toString()})`)
            subscriber.complete();
        }
        ws.onerror = (e) => log.error(e);
        ws.addListener("error", error);
        ws.addListener("open", open);
        ws.addListener("close", close);
        return () => {
            ws.removeListener("error", error);
            ws.removeListener("open", open);
            ws.removeListener("close", close);
        }
    }).pipe(
        shareReplay(1)
    );

    const session$ = clientConnection$.pipe(
        switchMapComplete(client => fromEvent<MessageEvent>(client, "message").pipe(
            map<MessageEvent, SocketMessage<SessionWelcome>>(event => JSON.parse(event.data)),
            filter(message => message.metadata.message_type == "session_welcome"),
            map(message => message.payload),
            tap(payload => log.info(`Received welcome from twitch socket. Session ID:${payload.session.id}`)),
            map(payload => ({
                sessionId: payload.session.id,
                client: client
            })),
            first()
        )),
        shareReplay(1)
    );

    const messages$ = session$.pipe(
        switchMapComplete(session => fromEvent<MessageEvent>(session.client, "message")),
        map<MessageEvent, SocketMessage<any>>(event => JSON.parse(event.data)),
        share()
    );

    function on<Payload, Condition>(type: string, condition: Condition, version = "2") {
        const sub$ = session$.pipe(
            switchMapComplete(session => new Observable<void>(subscriber => {
                let id: string = null;
                eventSub(authTokenSource, {
                    type: type,
                    version: version,
                    transport: {
                        method: "websocket",
                        session_id: session.sessionId
                    },
                    condition
                }).then(response => {
                    id = response.data[0].id;
                    subscriber.next()
                }).catch(e => {
                    subscriber.complete();
                    console.error(e);
                });
                return () => {
                    if (id && session.client.readyState == WebSocket.OPEN) {
                        eventUnsub(authTokenSource, id);
                    }
                }
            }), true)
        )

        return sub$.pipe(
            switchMapComplete(() => messages$),
            filter(message => message.metadata.subscription_type == type),
            map(message => message.payload as Payload)
        )
    }

    return {
        on
    }
}