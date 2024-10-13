import { logger } from "shared/logger";

export { sendChatMessage } from "./api/chat";
export { eventSub, eventUnsub, unsubscribeDisconnected } from "./api/event-sub";
export { getFollowers } from "./api/followers";
export { createPoll } from "./api/polls";
export { createPrediction } from "./api/predictions";
export { request as twitchRequest } from "./api/request";
export { getStream } from "./api/stream";
export { getUser } from "./api/user";

export const twitchLog = logger("twitch");