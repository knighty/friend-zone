import { FastifyInstance } from "fastify";
import { Config } from "../config";
import ejsLayout from "../layout";
import { getManifestPath } from "../utils";

export function initStreamModulesRouter(config: Config) {
    return async (fastify: FastifyInstance) => {
        type StreamModule = {
            id: string,
        }
        fastify.addHook('onRequest', ejsLayout("stream-modules/stream-module", async (req, res) => ({
            style: await getManifestPath("main.css"),
            scripts: await getManifestPath("main.js"),
            socketUrl: `${config.socketHost}/websocket`,
        })));
        function registerStreamModule(module: StreamModule) {
            fastify.get(`/${module.id}`, async (req, res) => {
                return res.viewAsync(`stream-modules/${module.id}`, {})
            })
        }

        fastify.get<{
            Querystring: {
                anchor: string
            },
        }>(`/friends`, async (req, res) => {
            const anchor = (req.query.anchor ?? "")
                .split(" ")
                .reduce((anchor, part) => {
                    switch (part) {
                        case "left": anchor.h = "start"; break;
                        case "center": anchor.h = "center"; break;
                        case "right": anchor.h = "end"; break;
                        case "top": anchor.v = "start"; break;
                        case "middle": anchor.v = "center"; break;
                        case "bottom": anchor.v = "end"; break;
                    }
                    return anchor;
                }, { h: "start", v: "end" });

            return res.viewAsync(`stream-modules/friends`, {
                anchor: `${anchor.v} ${anchor.h}`,
                anchorHorizontal: anchor.h,
                anchorVertical: anchor.v,
            })
        })

        registerStreamModule({
            id: "feeds"
        });
        registerStreamModule({
            id: "woth"
        });
        registerStreamModule({
            id: "mippy"
        });
    }
}