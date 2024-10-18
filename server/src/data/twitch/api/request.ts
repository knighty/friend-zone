import { defer, retry } from "rxjs";
import { httpsRequest } from "shared/network";
import { RequestError, Response } from "shared/network/request";
import { awaitResult } from "shared/utils";
import config from "../../../config";
import { twitchLog } from "../api";
import { AuthTokenSource } from "../auth-tokens";

export class APICallError extends Error {
    error?: JSONErrorResponse;
}

export type JSONResponse<T> = {
    data: T[];
};

type HTTPMethod = "GET" | "POST" | "PATCH" | "DELETE";

type BaseOptions<Method extends HTTPMethod> = {
    method: Method,
    path: string,
    json?: boolean,
    params?: Record<string, any>
}

type GetOptions = BaseOptions<"GET">;
type PostOptions = BaseOptions<"POST">;
type DeleteOptions = BaseOptions<"DELETE">;
type PatchOptions = BaseOptions<"PATCH">;

type Options = GetOptions | PostOptions | DeleteOptions | PatchOptions;

type JSONErrorResponse = {
    error: string,
    status: number,
    message: string
}

function isJsonErrorResponse<T>(response: Response<T | JSONErrorResponse>): response is Required<Response<JSONErrorResponse>> {
    return !!response.data && typeof response.data === 'object' && ("error" in response.data);
}

function isSuccessResponse<T>(response: Response<T | JSONErrorResponse>): response is Response<T> {
    return response.data != null && typeof response.data === 'object' && !("error" in response.data);
}

function isSuccessCode(code: number) {
    return code >= 200 && code < 300;
}

const apiHost = `https://api.twitch.tv:443`;

export async function request<T>(options: GetOptions, authToken: AuthTokenSource): Promise<T>;
export async function request<T>(options: PostOptions | PatchOptions | DeleteOptions, authToken: AuthTokenSource, body?: any): Promise<T>;
export async function request<T>(options: Options, authToken: AuthTokenSource, body?: any): Promise<T> {
    const method: HTTPMethod = options.method ?? 'GET';
    const url = new URL(`${apiHost}${options.path}`);
    const params = options.params ?? {};
    const json = options.json ?? true;
    for (let param in params) {
        url.searchParams.append(param, params[param]);
    }
    const path = `${url.pathname}${url.search}`;
    const data = body === undefined ? undefined : JSON.stringify(body);

    const requestOptions = {
        url, path, json,
        logger: twitchLog,
        headers: {
            "Authorization": `Bearer ${await authToken.get()}`,
            "Client-Id": config.twitch.clientId
        }
    };

    function makeRequest() {
        if (method == "GET") {
            return httpsRequest<T | JSONErrorResponse>({ ...requestOptions, method });
        } else {
            return httpsRequest<T | JSONErrorResponse>({ ...requestOptions, method }, data);
        }
    }

    const [error, response] = await awaitResult(makeRequest(), [RequestError]);
    if (error) {
        throw new APICallError(error.message, { cause: error });
    }
    if (json) {
        if (isJsonErrorResponse<T>(response)) {
            throw new APICallError(`${response.data.status}: ${response.data.error} - ${response.data.message}`);
        }
    } else {
        if (!isSuccessCode(response.statusCode)) {
            throw new APICallError(JSON.stringify(response.data));
        }
    }

    return response.data as T;
}

export function retryableTwitchRequest<T>(requestFactory: (attempt: number) => Promise<T>) {
    let num = 0;
    return defer(() => requestFactory(num++)).pipe(
        retry({
            delay: 5000,
            count: 5
        })
    )
}