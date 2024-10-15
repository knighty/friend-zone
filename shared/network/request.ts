import https from "https";
import { blue, green, red } from "kolorist";
import { Logger } from "../logger";

type HTTPMethod = "GET" | "POST" | "PATCH" | "DELETE";

function getMethodColor(method: HTTPMethod) {
    switch (method) {
        case "POST":
        case "PATCH":
            return blue;
        case "DELETE":
            return red;
    }
    return green;
}

type BaseOptions<Method extends HTTPMethod> = {
    method: Method,
    url: URL,
    json?: boolean,
    params?: Record<string, any>,
    logger?: Logger
    headers?: Record<string, any>
}

type GetOptions = BaseOptions<"GET">;
type PostOptions = BaseOptions<"POST">;
type DeleteOptions = BaseOptions<"DELETE">;
type PatchOptions = BaseOptions<"PATCH">;

type Options = GetOptions | PostOptions | DeleteOptions | PatchOptions;

export type Response<T> = {
    statusCode: number,
    data: T,
}

export async function httpsRequest<T>(options: GetOptions): Promise<Response<T>>;
export async function httpsRequest<T>(options: PostOptions | PatchOptions | DeleteOptions, body?: any): Promise<Response<T>>;
export async function httpsRequest<T>(options: Options, body?: any): Promise<Response<T>> {
    const method = options.method ?? 'GET';
    const url = options.url;
    const params = options.params ?? {};
    const json = options.json ?? true;
    const encoding: BufferEncoding = "utf8";
    const headers = (body !== undefined ? {
        'Content-Type': json ? 'application/json' : 'application/octet-stream',
        'Content-Length': Buffer.byteLength(body)
    } : {})

    for (let param in params) {
        url.searchParams.append(param, params[param]);
    }
    const path = `${url.pathname}${url.search}`;

    options.logger?.info(`${getMethodColor(method)(`${method}:`)} ${green(path)}`);
    const requestOptions = {
        host: url.hostname,
        port: url.port,
        path: path,
        method: method,
        headers: {
            ...options.headers,
            ...headers
        }
    };

    return new Promise((resolve, reject) => {
        const fn = requestOptions.method == "GET" ? https.get : https.request;
        const request = fn(requestOptions, function (res) {
            res.setEncoding(encoding);
            let chunks: string[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on("end", () => {
                if (!res.statusCode) {
                    reject();
                    return;
                }
                const data = chunks.join("");
                if (json) {
                    if (data == "") {
                        resolve({
                            statusCode: res.statusCode,
                            data: data as T
                        });
                        return;
                    }
                    const json = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        data: json as T
                    });
                } else {
                    resolve({
                        statusCode: res.statusCode,
                        data: data as T
                    });
                }
            });
        });
        if (body !== undefined) {
            request.write(body);
        }
        if (requestOptions.method != "GET") {
            request.end();
        }

        request.on("error", error => reject(error));
    });
}