import { Mippy } from "../mippy";

export { changePersonalityPlugin } from "./plugins/change-personality";
export { createPollPlugin } from "./plugins/create-poll";
export { createPredictionPlugin } from "./plugins/create-prediction";
export { highlightedMessagesPlugin } from "./plugins/highlighted-messages";
export { relayMessagesToTwitchPlugin } from "./plugins/message-relay";
export { streamEventsPlugin } from "./plugins/stream-events";

export type MippyPlugin = {
    name: string,
    init: (mippy: Mippy) => Promise<{
        disable?: () => void
    } | null>
}