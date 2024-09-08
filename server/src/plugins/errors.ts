import { FastifyReply, FastifyRequest } from "fastify";
import config from "../config";
import { log } from "../lib/logger";

function getErrorTemplate(status: number) {
    const customPages = [403, 404];
    if (customPages.includes(status)) {
        return `errors/${status}`;
    }
    return "errors/500"
}

export const errorHandler = (async (err: Error, request: FastifyRequest, reply: FastifyReply) => {
    err.stack = (config.errors.stackTraces ? err.stack : '') || ''
    const status = (<any>err).status || 500;
    if (status == 500) {
        log.error(err.message);
    }
    const error = { message: err.message }
    const tpl = getErrorTemplate(status);
    const body = await reply.viewAsync(tpl, {
        errorText: error.message,
        stack: err.stack,
        status: status,
        layout: null,
    });
    return reply.status(status).view("errors/layout", { body: body, status: status });
})