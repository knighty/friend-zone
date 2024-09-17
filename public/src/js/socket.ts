import { connectBrowserSocket } from "shared/websocket/browser";

export const socket = connectBrowserSocket(document.body.dataset.socketUrl);