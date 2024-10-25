import fastifyCaching from "@fastify/caching";
import { FastifyInstance } from "fastify";
import fs from "fs/promises";
import { green } from "kolorist";
import path from "path";
import { logger } from "shared/logger";
import { httpReadableStream } from "shared/network";
import { Config } from "../../../config";
import Users from "../../../data/users";
import { randomString } from "../../../utils";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
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

export class ScreenshotRepository {
    screenshots = new Map<string, Buffer>();

    add(filename: string, image: Buffer) {
        this.screenshots.set(filename, image);
        setTimeout(() => {
            this.screenshots.delete(filename);
        }, 10 * 60 * 1000)
        return `http://51.191.172.95:3000/mippy/plugins/screenshot/images/${filename}`
    }

    get(filename: string) {
        return this.screenshots.get(filename);
    }
}
const log = logger("screenshot-plugin");
export function screenshotPlugin(fastify: FastifyInstance, config: Config, users: Users, screenshotRepository: ScreenshotRepository): MippyPluginDefinition {
    return {
        name: "Get Screenshot",
        permissions: [],
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                /*const sub = mippy.brain.observeToolMessage("getScreen").pipe(
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
                    })
                ).subscribe(filename => {
                    mippy.ask("generic", {}, { role: "user", image: [`http://51.191.172.95:3000/mippy/plugins/screenshot/images/${filename}`], store: false, source: "admin" })
                })*/

                fastify.register(async (fastify: FastifyInstance) => {
                    fastify.register(fastifyCaching, {
                        expiresIn: 86400,
                        privacy: fastifyCaching.privacy.PUBLIC
                    })

                    fastify.get<{
                        Params: {
                            filename: string
                        }
                    }>("/images/:filename", async (req, res) => {
                        return screenshotRepository.get(req.params.filename);
                    });
                }, { prefix: "mippy/plugins/screenshot" })

                return {
                    disable() {
                        //sub.unsubscribe();
                    },
                }
            }

            return null;
        }
    }
}

