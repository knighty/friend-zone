import https from "https";

export function httpsReadableStream(url: Parameters<typeof https.get>[0]) {
    return new ReadableStream({
        start(controller) {
            const request = https.get(url, function (res) {
                res.setEncoding("binary");
                /*if (!res.headers["content-length"])
                    throw new Error("No content length");
                let data = Buffer.alloc(Number(res.headers["content-length"]));*/
                res.on('data', chunk => controller.enqueue(Buffer.from(chunk, 'binary')));
                res.on("end", () => {
                    controller.close();
                });
            });
            request.on("error", e => {
                controller.close();
            });
        }
    });
}