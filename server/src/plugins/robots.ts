import { FastifyInstance } from "fastify";

export const fastifyRobots = async (fastify: FastifyInstance) => {
    fastify.get("/robots.txt", async (req, res) => {
        res.header("Cache-control", "public").send(`User-Agent: *
    Disallow:`)
    });
};
