import { logger } from "shared/logger";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginDefinition } from "../plugins";

const log = logger("change-personality-plugin");

export function changePersonalityPlugin(): MippyPluginDefinition {
    return {
        name: "Change Personality",
        init: async mippy => {
            if (mippy.brain instanceof ChatGPTMippyBrain) {
                const brain = mippy.brain;

                return {
                    disable() {
                    }
                }
            }
            return null;
        }
    }
}