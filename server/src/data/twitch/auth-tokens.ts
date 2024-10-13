import fs from "fs/promises";
import https from "https";
import querystring from "querystring";
import { log } from "shared/logger";
import config from "../../config";

interface AppAccessTokenResponse {
    access_token: string,
    expires_in: number,
    token_type: string,
}

type RefreshTokenResponse = {
    access_token: string,
    refresh_token: string,
    scope: string[],
    token_type: string,
    expires_in: number
}

export async function requestAppAccessToken(): Promise<AppAccessTokenResponse> {
    const postData = {
        client_id: config.twitch.clientId,
        client_secret: config.twitch.secret,
        grant_type: 'client_credentials'
    };
    var postBody = querystring.stringify(postData);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'id.twitch.tv',
            path: `/oauth2/token`,
            port: 443,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postBody.length
            }
        }, function (res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                resolve(<AppAccessTokenResponse>JSON.parse(chunk));
            });
        });
        req.write(postBody);
        req.on("error", error => reject(error));
        req.end();
    })
}

export async function requestUserToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const postData = {
        client_id: config.twitch.clientId,
        client_secret: config.twitch.secret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    };
    var postBody = querystring.stringify(postData);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'id.twitch.tv',
            path: `/oauth2/token`,
            port: 443,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postBody.length
            }
        }, function (res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                resolve(<RefreshTokenResponse>JSON.parse(chunk));
            });
        });
        req.write(postBody);
        req.on("error", error => reject(error));
        req.end();
    })
}

export interface AuthTokenSource {
    get(): Promise<string>;
    refresh(): Promise<string>;
}

export class UserAuthTokenSource implements AuthTokenSource {
    token: string = "";
    refreshToken: string = "";
    id: string = "";
    file: string;
    lastRefresh: number | null = null;
    refreshPromise: Promise<void> | null = null;
    getPromise: Promise<string> | null = null;
    expiresAt: number;

    constructor(file: string, token: string = "", refreshToken: string = "", expiresIn: number = 0) {
        this.file = file;
        this.token = token;
        this.refreshToken = refreshToken;
        this.expiresAt = Date.now() + expiresIn * 1000
    }

    async get() {
        if (this.getPromise != null) {
            return await this.getPromise;
        }

        if (this.token == "") {
            this.getPromise = new Promise(async (resolve, reject) => {
                try {
                    const data = JSON.parse((await fs.readFile(this.file)).toString());
                    this.token = data.accessToken;
                    this.refreshToken = data.refreshToken;
                    this.expiresAt = data.expiresAt ?? 0;
                    this.id = data.id;
                    if (this.expiresAt < Date.now() - 60000) {
                        await this.refresh();
                    }
                } finally {
                    this.getPromise = null;
                }
                resolve(this.token);
            })
            return await this.getPromise;
        }
        return this.token;
    }

    async refresh(): Promise<string> {
        if (this.refreshPromise == null) {
            this.refreshPromise = new Promise(async (resolve, reject) => {
                const tokenResponse = await requestUserToken(this.refreshToken);
                const data = JSON.parse((await fs.readFile(this.file)).toString());
                data.accessToken = tokenResponse.access_token;
                data.refreshToken = tokenResponse.refresh_token;
                data.expiresAt = Date.now() + tokenResponse.expires_in * 1000;
                await fs.writeFile(this.file, JSON.stringify(data));
                this.token = tokenResponse.access_token;
                this.refreshToken = tokenResponse.refresh_token;
                this.expiresAt = data.expiresAt;
                log.info(`Got a new user access token ${this.token}`, "twitch");
                this.refreshPromise = null;
                resolve();
            });
        }
        await this.refreshPromise;
        return this.token;
    }
}

export class AppAuthTokenSource implements AuthTokenSource {
    constructor() {
    }

    async get() {
        const token: any = null;
        if (token != null)
            return Promise.resolve(token);
        return this.refresh();
    }

    async refresh(): Promise<string> {
        const tokenResponse = await requestAppAccessToken();
        log.info(`Got a new app access token ${tokenResponse.access_token}`, "twitch");
        return Promise.resolve(tokenResponse.access_token);
    }
}