import https from "https";
import { green } from "kolorist";
import { defer, retry } from "rxjs";
import config from "../../../config";
import { twitchLog } from "../api";
import { AuthTokenSource } from "../auth-tokens";

export class APICallError extends Error { }

export type JSONResponse<T> = {
    data: T[];
};

export async function request<T>(options: {
    path: string,
    method?: string,
}, authToken: AuthTokenSource, json: boolean = true, body?: any): Promise<T> {
    twitchLog.info(`Request: ${green(options.path)}`);

    if (options.method != "POST" && options.method != "PATCH" && body != undefined)
        throw new Error("You can't supply a body with anything but a POST or PATCH request");

    const data = body === undefined ? null : JSON.stringify(body);
    const requestOptions = {
        host: 'api.twitch.tv',
        port: 443,
        path: options.path,
        method: options.method ?? 'GET',
        headers: {
            "Authorization": `Bearer ${await authToken.get()}`,
            "Client-Id": config.twitch.clientId,
            ...(data != null ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            } : {})
        }
    };

    return new Promise((resolve, reject) => {
        const fn = requestOptions.method == "GET" ? https.get : https.request;
        const request = fn(requestOptions, function (res) {
            res.setEncoding('utf8');
            let data = "";
            res.on('data', chunk => data += chunk);
            res.on("end", () => {
                if (res.statusCode != undefined && (res.statusCode >= 200 && res.statusCode < 300)) {
                    if (json) {
                        const json = JSON.parse(data);
                        resolve(<T>json);
                    } else {
                        resolve(data as T);
                    }
                } else {
                    const json = JSON.parse(data);
                    reject(new APICallError(json.message));
                }
            });
        });
        if (data != null) {
            request.write(data);
        }
        if (requestOptions.method != "GET") {
            request.end();
        }

        request.on("error", error => reject(error));
    });
}

export function retryableTwitchRequest<T>(requestFactory: () => Promise<T>) {
    return defer(requestFactory).pipe(
        retry({
            delay: 5000,
            count: 5
        })
    )
}