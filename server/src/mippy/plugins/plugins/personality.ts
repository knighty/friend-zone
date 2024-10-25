import { distinctUntilChanged, EMPTY, map, switchMap } from "rxjs";
import { logger } from "shared/logger";
import { Redemptions } from "../../../data/redemptions";
import { ChatGPTMippyBrain } from "../../chat-gpt-brain";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const log = logger("personality-plugin");

const pluginConfig = {
    redemption: {
        name: "Redemption",
        description: "Redemption for changing personality",
        type: "redemption",
        default: "",
    },
    duration: {
        name: "Duration of Random Personality",
        description: "In minutes",
        type: "number",
        default: 10,
        min: 0,
        max: 60,
        step: 2
    }
} satisfies MippyPluginConfigDefinition;

export function personalityPlugin(redemptions: Redemptions): MippyPluginDefinition {
    return {
        name: "Personality",
        permissions: [],
        config: pluginConfig,
        init: async (mippy, config: MippyPluginConfig<typeof pluginConfig>) => {
            const redemptions$ = config.observe("redemption").pipe(
                switchMap(id => redemptions.onRedeem(id)),
                map(data => ({
                    user: data.user_name,
                    text: data.user_input
                }))
            )

            config.observe("redemption").pipe(
                map(id => id != ""),
                distinctUntilChanged(),
                switchMap(watch => watch ? redemptions$ : EMPTY)
            ).subscribe(() => {
                if (mippy.brain instanceof ChatGPTMippyBrain) {
                    mippy.brain.setPersonality("");
                }
            });

            return {
                disable() {
                },
            }
        }
    }
}

