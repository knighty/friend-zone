import { FastifyInstance } from "fastify";
import { filter, map, scan, shareReplay, switchMap, timer, withLatestFrom } from "rxjs";
import { log } from "shared/logger";
import { awaitResult } from "shared/utils";
import { getLatestFollower, getLatestSubscriber } from "../../../data/twitch/api";
import { UserAuthTokenSource } from "../../../data/twitch/auth-tokens";
import ejsLayout from "../../../layout";
import { socket } from "../../../plugins/socket";
import { getManifestPath } from "../../../utils";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const pluginConfig = {
    messages: {
        name: "Messages",
        description: "A list of messages to go through. Use double line breaks to seperate messages",
        type: "string-array",
        default: [""]
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

type TickerDataSource = () => Promise<string>;

const replace = async (input: string, regex: RegExp, replacer: (token: string) => Promise<string>) => {
    // we need to remove the 'g' flag, if defined, so that all replacements can be made
    let flags = (regex.flags || '').replace('g', '');
    let re = new RegExp(regex.source || regex, flags);
    let index = 0;
    let match;

    while ((match = re.exec(input.slice(index)))) {
        let value = await replacer(match[1]);
        index += match.index;
        input = input.slice(0, index) + value + input.slice(index + match[0].length);
        index += match[0].length;

        // if 'g' was not defined on flags, break
        if (flags === regex.flags) {
            break;
        }
    }

    return input;
};

export function tickerPlugin(fastify: FastifyInstance, socketHost: string, userToken: UserAuthTokenSource, userId: string): MippyPluginDefinition {
    const tickerDataSources: Record<string, TickerDataSource> = {
        latestFollower: async () => {
            const [error, result] = await awaitResult(getLatestFollower(userToken, userId));
            if (error) {
                log.error(new Error("Error fetching latest follower", { cause: error }));
                return "";
            }
            return result?.user_name ?? ""
        },
        latestSubscriber: async () => {
            const [error, result] = await awaitResult(getLatestSubscriber(userToken, userId));
            if (error) {
                log.error(new Error("Error fetching latest subscriber", { cause: error }));
                return "";
            }
            return result?.user_name ?? ""
        }
    }

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
                map(([i, messages]) => messages[(i % messages.length)]),
                switchMap(message => {
                    return replace(message, /\[(\w*)\]/g, async source => {
                        if (source in tickerDataSources) {
                            return tickerDataSources[source]();
                        }
                        return Promise.resolve("");
                    })
                }),
                shareReplay(1)
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