import { WebSocket } from "ws";
import { connectGenericClient } from "./generic-client";

export const connectClient = connectGenericClient(url => {
    const socket = new WebSocket(url);
    return socket;
});