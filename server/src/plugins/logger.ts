import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { cyan, green, red, yellow } from "kolorist";
import { log } from "../lib/logger";

type LoggerOptions = {
    duration?: boolean,
    url?: boolean,
    date?: boolean,
    memory?: boolean
}

export const fastifyLogger = (fastify: FastifyInstance, opts: LoggerOptions = {}) => {
    const options: LoggerOptions = {
        duration: true,
        url: true,
        date: false,
        memory: true,
        ...opts
    }

    fastify.addHook("onResponse", (req: FastifyRequest, res: FastifyReply, done: any) => {
        const memory = `${Math.round(process.memoryUsage().heapUsed / 1000000)}mb`;
        const elapsedTimeInMilliseconds = res.elapsedTime;
        const rounded = elapsedTimeInMilliseconds > 1000 ? Math.floor(elapsedTimeInMilliseconds).toString() : (Math.floor(elapsedTimeInMilliseconds * 100) / 100).toString();
        const segments = [];
        if (options.date)
            segments.push(`[${(new Date()).toTimeString().substring(0, 8)}]`);
        if (options.duration)
            segments.push(`[${rounded.padStart(5, " ").slice(0, 5)}ms]`)
        if (options.memory)
            segments.push(`[${memory}]`)
        if (options.url)
            segments.push(green(req.originalUrl))
        const statusClientError = res.statusCode >= 400;
        const statusServerError = res.statusCode >= 500;
        const statusColor = statusServerError ? red : statusClientError ? yellow : green;
        log.info(`${cyan(req.method)}:${statusColor(res.statusCode)} ${segments.join(" ")}`);

        done();
    });
}

