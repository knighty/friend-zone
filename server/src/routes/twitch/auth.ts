import { FastifyInstance, FastifyRequest } from "fastify";
import fs from "fs/promises";
import https from "https";
import querystring from "querystring";
import config from "../../config";
import { getUser } from "../../data/twitch/api/user";
import { UserAuthTokenSource } from "../../data/twitch/auth-tokens";

interface TokenResponse {
    access_token: string,
    expires_in: number,
    refresh_token: string,
    scope: string[],
    token_type: string
}

function makeid(length: number) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}

function getStateString() {
    return makeid(20);
}

export default function initRouter(types: Record<string, { scopes: string[], filePath: string }>) {
    async function buildTwitchLink(url: string, state: string, scopes: string[]) {
        return `https://id.twitch.tv/oauth2/authorize?${querystring.encode({
            response_type: "code",
            client_id: config.twitch.clientId,
            redirect_uri: config.twitch.redirectUrl,
            scope: scopes.join(" "),
            state: state
        })}`;
    }

    function requestToken(code: string, state: string): Promise<TokenResponse> {
        const postData = {
            client_id: config.twitch.clientId,
            client_secret: config.twitch.secret,
            redirect_uri: config.twitch.redirectUrl,
            grant_type: "authorization_code",
            code: code,
        };
        const postBody = querystring.stringify(postData);
        const options = {
            host: 'id.twitch.tv',
            port: 443,
            path: `/oauth2/token`,
            method: 'POST'
        };

        return new Promise((resolve, reject) => {
            const request = https.request(options, function (res) {
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    const json = JSON.parse(chunk);
                    resolve(<TokenResponse>json);
                });
            });
            request.write(postBody);
            request.on("error", error => reject(error));
            request.end();
        });
    }

    return async (fastify: FastifyInstance) => {
        fastify.get<{
            Params: {
                tokenType: string
            }
        }>("/redirect/:tokenType", async (req, res) => {
            if (!types[req.params.tokenType])
                throw new Error("Invaid token type");
            const url = await buildTwitchLink("/", req.params.tokenType, types[req.params.tokenType].scopes);
            return res.redirect(url);
        });

        fastify.get("/link", async (req: FastifyRequest<{
            Querystring: { code: string, state: string }
        }>, res) => {
            const code = <string>req.query.code;
            const state = <string>req.query.state;
            const tokenType = state;

            // Exchange token
            const tokenResponse = await requestToken(code, state);

            // Look up the user's info
            const file = types[tokenType].filePath;
            const userAuthToken = new UserAuthTokenSource(file, tokenResponse.access_token, tokenResponse.refresh_token, tokenResponse.expires_in);
            const userInfo = await getUser(userAuthToken);
            userAuthToken.id = userInfo.id;

            // Save locally
            const twitchUser = await fs.writeFile(file, JSON.stringify({
                accessToken: userAuthToken.token,
                refreshToken: userAuthToken.refreshToken,
                expiresAt: Date.now() + tokenResponse.expires_in * 1000,
                broadcasterId: userInfo.id,
                ...userInfo
            }))

            return "Done";
        });
    }
}