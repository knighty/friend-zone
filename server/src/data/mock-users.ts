import { randomInterval, Subscriptions } from "shared/rx";
import DiscordVoiceState from "./discord-voice-state";
import ExternalFeeds from "./external-feeds";
import { sentences } from "./sentences";
import Subtitles from "./subtitles";
import Users, { User } from "./users";

export default function mockUsers(mockUsers: (User & { feed: string | null })[], users: Users, feeds: ExternalFeeds, discordVoiceState: DiscordVoiceState, subtitles: Subtitles) {
    const subscriptions = new Subscriptions();
    for (let user of mockUsers) {
        const id = user.name.toLowerCase();
        const name = user.name;
        const discordId = user.discordId;
        const image = user.feed;

        users.register(id, user);
        if (image) {
            feeds.addFeed({
                active: true,
                focused: null,
                aspectRatio: "16/9",
                sourceAspectRatio: "16/9",
                url: `image:${image}`,
                user: id
            });
        };
        subscriptions.add({
            unsubscribe: () => {
                feeds.removeFeed(id);
                users.remove(id);
            }
        })
        subscriptions.add(randomInterval(500, 1500).subscribe(() => {
            if (Math.random() > 0.5) {
                discordVoiceState.speaking.set(discordId, Math.random() > 0.5);
            } else {
                discordVoiceState.speaking.delete(discordId);
            }
        }));
        subscriptions.add(randomInterval(2000, 7000).subscribe(i => subtitles.handle(name.toLowerCase(), i, "final", sentences[Math.floor(sentences.length * Math.random())])))
    }

    return {
        unmock: () => {
            subscriptions.unsubscribe()
        }
    }
}