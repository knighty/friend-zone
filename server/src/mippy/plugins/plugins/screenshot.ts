import fastifyStatic from "@fastify/static";
import { FastifyInstance } from "fastify";
import fs from "fs/promises";
import { green } from "kolorist";
import path from "path";
import { concatMap, EMPTY, switchMap, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { httpReadableStream } from "shared/network";
import { Config, isTwitchConfig } from "../../../config";
import Users from "../../../data/users";
import { randomString } from "../../../utils";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { isUserPrompt } from "../../mippy-brain";
import { MippyPluginDefinition } from "../plugins";

const downloadDir = path.join(__dirname, `../../../../../public/downloads/images/`);

export async function downloadImage(imageUrl: string) {
    const url = new URL(imageUrl);
    const stream = httpReadableStream(url);
    const filename = `${randomString(20)}.jpg`;
    await fs.writeFile(path.join(downloadDir, filename), stream);
    log.info(`Downloaded file to ${green(filename)}`);
    return filename;
}

async function imageToFile(buffer: Buffer) {
    const filename = `${randomString(20)}.jpg`;
    await fs.writeFile(path.join(downloadDir, filename), buffer);
    log.info(`Downloaded file to ${green(filename)}`);
    return filename;
}

const log = logger("screenshot-plugin");
export function screenshotPlugin(fastify: FastifyInstance, config: Config, users: Users): MippyPluginDefinition {
    return {
        name: "Get Screenshot",
        permissions: [],
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                function getImageUrl() {
                    if (isTwitchConfig(config.twitch)) {
                        //return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${config.twitch.channel}-960x540.jpg`
                        return "https://preview.redd.it/who-wants-to-be-a-millionaire-125k-question-v0-bgiwe517dwkc1.jpeg?auto=webp&s=0e92a9c5627850089b5c0c252eb9d496f156be7b";
                    }
                    return null;
                }

                const sub = mippy.brain.observeToolMessage("getScreenshot").pipe(
                    withLatestFrom(users.observe()),
                    concatMap(([message, activeUsers]) => {
                        log.info("Get screenshot requested");
                        if (isUserPrompt(message.prompt) && message.prompt.name) {
                            const user = activeUsers[message.prompt.name];
                            if (!user)
                                return EMPTY;
                            return users.requestScreenGrab(user).pipe(
                                switchMap(data => !!data ? imageToFile(data.screen) : EMPTY)
                            );
                        }
                        return EMPTY;
                        /*const imageUrl = getImageUrl();
                        if (imageUrl) {
                            const filename = await downloadImage(imageUrl);
                            mippy.ask("generic", {}, { role: "user", image: [`http://51.191.172.95:3000/mippy/plugins/screenshot/images/${filename}`], store: false, source: "admin" })
                        }*/
                    })
                ).subscribe(filename => {
                    mippy.ask("generic", {}, { role: "user", image: [`http://51.191.172.95:3000/mippy/plugins/screenshot/images/${filename}`], store: false, source: "admin" })
                })

                fastify.register(async (fastify: FastifyInstance) => {
                    fastify.register(fastifyStatic, {
                        root: downloadDir,
                        cacheControl: true,
                        maxAge: 3600 * 1000,
                        prefix: "/images",
                        decorateReply: false
                    });
                }, { prefix: "mippy/plugins/screenshot" })

                return {
                    disable() {
                        sub.unsubscribe();
                    },
                }
            }

            return null;
        }
    }
}

