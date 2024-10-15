import { tap } from "rxjs";
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
                const sub = mippy.brain.observeTool("changePersonality").pipe(
                    tap(args => {
                        mippy.say("I got asked to change my personality");
                        brain.setPersonality(args.personality);
                        log.info(`Changing personality:\n${args.personality}`);
                    })
                ).subscribe();

                return {
                    disable() {
                        sub.unsubscribe()
                    }
                }
            }
            return null;
        }
    }
}