import { FastifyInstance } from "fastify";
import { filter, map, scan, switchMap, timer, withLatestFrom } from "rxjs";
import ejsLayout from "../../../layout";
import { socket } from "../../../plugins/socket";
import { getManifestPath } from "../../../utils";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const pluginConfig = {
    messages: {
        name: "Messages",
        description: "A list of messages to go through. Use double line breaks to seperate messages",
        type: "string-array",
        default: []
    },
    frequency: {
        name: "Frequency",
        description: "How fast to cycle messages in seconds",
        type: "number",
        default: 15,
        min: 10,
        max: 120,
    }
} satisfies MippyPluginConfigDefinition;

export function tickerPlugin(fastify: FastifyInstance, socketHost: string): MippyPluginDefinition {
    return {
        name: "Ticker",
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>) {
            const message$ = config.observe("messages");

            const ticker$ = config.observe("frequency").pipe(
                switchMap(frequency => timer(0, 1000 * frequency)),
                scan((a, c) => a + 1, 0),
                withLatestFrom(message$),
                filter(([i, messages]) => messages.length > 0),
                map(([i, messages]) => messages[(i % messages.length)])
            )

            fastify.register(async (fastify: FastifyInstance) => {
                fastify.addHook('onRequest', ejsLayout("stream-modules/stream-module", async (req, res) => ({
                    style: await getManifestPath("main.css"),
                    scripts: await getManifestPath("main.js"),
                    socketUrl: `${socketHost}/mippy/plugins/ticker/websocket`,
                })));

                fastify.get(`/view`, async (req, res) => {
                    return res.viewAsync(`stream-modules/ticker`, {})
                })

                fastify.register(socket([{
                    type: "ticker",
                    data: ticker$
                }]));
            }, { prefix: "/mippy/plugins/ticker" })

            return {
                disable() {

                }
            }
        },

    }
}