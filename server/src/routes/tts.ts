import { FastifyInstance } from "fastify";
import { AudioRepository } from "../plugins/audio-socket";

export function initTtsRouter(audioRepository: AudioRepository) {
    return async (fastify: FastifyInstance) => {
        fastify.get<{
            Params: {
                id: string
            }
        }>("/audio/:id", async (req, res) => {
            res.header('Content-Type', 'audio/wav');
            try {
                const stream = await audioRepository.getStream(req.params.id);
                return stream.getReadableStream();
            } catch (e) {
                return e;
            }
        })
    }
}