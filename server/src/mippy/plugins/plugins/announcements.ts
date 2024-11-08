import { EMPTY, merge, switchMap, tap } from "rxjs";
import { Stream, StreamProperties } from "../../../data/stream";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

const pluginConfig = {
    changeTitle: {
        name: "Change Title",
        description: "When the stream title is updated",
        type: "boolean",
        default: false
    },
    changeCategory: {
        name: "Change Category",
        description: "When the stream category is updated",
        type: "boolean",
        default: false
    },
    emojiOnlyMode: {
        name: "Emoji Only Mode",
        description: "When the stream chat is set to/from emoji only mode",
        type: "boolean",
        default: false
    }
} satisfies MippyPluginConfigDefinition;

export function announcementsPlugin(stream: Stream, streamProperties: StreamProperties): MippyPluginDefinition {
    return {
        name: "Announcements",
        permissions: ["sendMessage"],
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>) {
            const sub = stream.whenLive(
                merge(
                    config.observe("changeTitle").pipe(
                        switchMap(enabled => enabled ? streamProperties.title : EMPTY),
                        tap(title => mippy.ask("setTitle", { title }, { allowTools: false }))
                    ),

                    config.observe("changeCategory").pipe(
                        switchMap(enabled => enabled ? streamProperties.category : EMPTY),
                        tap(category => mippy.ask("setCategory", { category: category.name, viewers: category.viewers.toString() }, { allowTools: false }))
                    ),

                    config.observe("emojiOnlyMode").pipe(
                        switchMap(enabled => enabled ? streamProperties.emojiOnlyMode : EMPTY),
                        tap(emojiOnly => mippy.ask("setEmojiOnly", { emojiOnly: emojiOnly }, { allowTools: false }))
                    )
                )
            ).subscribe();

            return {
                disable() {
                    sub.unsubscribe();
                },
            };
        },
    }
}