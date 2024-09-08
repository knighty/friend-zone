import fastifyCaching from "@fastify/caching";
import { FastifyInstance } from "fastify";

type FaviconOptions = {
    favicon?: string,
    expiresIn?: number,
    root: string;
}

export const fastifyFavicon = async (fastify: FastifyInstance, options: FaviconOptions) => {
    fastify.register(fastifyCaching, {
        privacy: fastifyCaching.privacy.PUBLIC,
        expiresIn: options.expiresIn ?? (60 * 60 * 24 * 7),
    });

    fastify.get("/favicon.ico", async (req, res) => {
        return res.sendFile(options.favicon ?? "favicon.ico", options.root);
    });
};
