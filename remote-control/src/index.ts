import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance } from "fastify";
import path from "node:path";
import { fromEvent, ignoreElements, interval, merge, takeUntil, tap } from "rxjs";
import { log } from "../../server/src/lib/logger";
import { hotkey } from "./hotkeys";
import { initSocket } from "./socket";

type Config = {
    hotkeys: {
        focus: string[],
        endFocus: string[],
    },
    url: string,
    user: string,
    socket: string
}

const config = require(path.join(__dirname, "../config.js")) as Config;

const remoteControl = initSocket(config.socket, config.user);

hotkey(config.hotkeys.focus).subscribe(() => {
    console.log("Focus mode enabled");
    remoteControl.remoteControl("focus");
});
hotkey(config.hotkeys.endFocus).subscribe(() => {
    console.log("Focus mode disabled");
    remoteControl.remoteControl("unfocus");
});

const fastifyApp = Fastify();
fastifyApp.register(fastifyView, {
    engine: {
        ejs: require("ejs"),
    },
    root: path.join(__dirname, 'views'),
    propertyName: 'view',
    asyncPropertyName: 'viewAsync',
    viewExt: 'ejs',
});
fastifyApp.register(websocket);

fastifyApp.register(async (fastify: FastifyInstance, options: {}) => {
    fastify.get('/websocket', { websocket: true }, (socket, req) => {
        console.log("socket");
        const ping$ = interval(30 * 1000).pipe(
            tap(i => socket.ping()),
        );

        socket.on('message', (event: any) => {
            try {
                const message = JSON.parse(event.toString());
                remoteControl.sendVoice(message.id, message.type, message.text);
                //console.log(`[${message.id}] ${message.text} ${message.type == "final" ? "(final)" : ""}`);
                if (message.type == "final")
                    console.log(`[${message.id}] ${message.text}`);
            } catch (e) {

            }
        });

        merge(
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
});

fastifyApp.get("/", (req, rep) => {
    return rep.view("app");
});

const server = fastifyApp.listen({ port: 3010, host: "0.0.0.0" }, function (err, address) {
    console.log(`Running at http://localhost:${3010}`);
    if (err) {
        console.error(err.message);
        fastifyApp.log.error(err, "server")
        process.exit(1)
    }
});