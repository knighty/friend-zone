import fastifyView from "@fastify/view";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance } from "fastify";
import child_process from "node:child_process";
import path from "node:path";
import { fromEvent, ignoreElements, interval, merge, takeUntil, tap } from "rxjs";
import { log } from "../../server/src/lib/logger";
import { config } from "./config";
import { hotkey } from "./hotkeys";
import { initSocket } from "./socket";

const remoteControl = initSocket(config.socket, config.user);

hotkey(config.hotkeys.focus).subscribe(() => {
    console.log("Focus mode enabled");
    remoteControl.feed("focus");
});
hotkey(config.hotkeys.endFocus).subscribe(() => {
    console.log("Focus mode disabled");
    remoteControl.feed("unfocus");
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

fastifyApp.register(async (fastify: FastifyInstance) => {
    fastify.get('/websocket', { websocket: true }, (socket, req) => {
        console.log("socket");
        const ping$ = interval(30 * 1000).pipe(
            tap(i => socket.ping()),
        );

        socket.on('message', (event: any) => {
            try {
                const message = JSON.parse(event.toString());
                remoteControl.subtitles(message.id, message.type, message.text);
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

const pythonProcess = child_process.spawn('python', [
    path.join(__dirname, "/../../whisper/transcribe_demo.py"),
    `--model=${config.whisper.model}`,
    `--phrase_timeout=${config.whisper.phrase_timeout}`,
    `--energy_threshold=${config.whisper.energy_threshold}`
]);
pythonProcess.stdout.on('data', (data: string) => {
    const subtitle = data.toString();
    console.log(subtitle);
    const split = subtitle.split(" ");
    if (split[0] == "subtitle") {
        const id = split[1];
        const text = split.slice(2).join(" ");
        remoteControl.subtitles(Number(id), "final", text);
    }
    //console.log(data.toString());
});
pythonProcess.stderr.on('data', (data: string) => {
    console.log(data.toString());
});
//pythonProcess.kill();