import { distinctUntilChanged, finalize, map, Subscription, switchMap, take, timer } from "rxjs";
import { createElement } from "shared/utils";
import { getUser, socketData } from "../../socket";
import { FriendElement } from "../friends/friend";
import { Embed } from "./embed-handlers/embed-handler";
import { handleEmbed } from "./embed-handlers/embed-handlers";

type Feed = {
    user: string,
    focused: string,
    active: boolean,
    url: string,
    aspectRatio: string,
    sourceAspectRatio: string,
}

export default class FeedContainer extends HTMLElement {
    private element: HTMLElement = null;
    private item: Feed = null;
    private subscription: Subscription = null;
    private currentEmbed: Embed = null;

    disconnectedCallback() {
        if (this.currentEmbed && this.currentEmbed.unload) {
            this.currentEmbed.unload();
            this.currentEmbed = null;
            this.item = null;
        }
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    }

    canAccept(feed: Feed) {
        return feed.user == this.item?.user;
    }

    accept(feed: Feed) {
        const isSame = this.item?.url == feed.url && this.item?.user == feed.user;
        if (!isSame) {
            const user$ = getUser(feed.user);
            const voice$ = user$.pipe(
                switchMap(user => socketData.voice$.pipe(map(users => !!users[user.discordId]))),
                distinctUntilChanged()
            )
            const wothCount$ = user$.pipe(
                switchMap(user => socketData.woth$.pipe(map(woth => (woth.counts[user.id] ?? 0).toString()))),
                distinctUntilChanged()
            );

            if (this.currentEmbed && this.currentEmbed.unload)
                this.currentEmbed.unload();
            const previousElement = this.element;
            this.element = createElement("div", { classes: ["feed"] });

            this.element.innerHTML = `
                <div class="video">
                    <div class="video-container"></div>
                </div>
                <x-friend></x-friend>`;
            this.appendChild(this.element);

            const element = this.element.querySelector<FriendElement>("x-friend");
            element.bindData("woth", wothCount$);
            element.bindData("voice", voice$);
            element.bindData("name", user$.pipe(map(user => user.name)));

            const embed = handleEmbed(feed.url, this.element.querySelector(".video-container"));
            this.currentEmbed = typeof embed == "boolean" ? null : embed;

            if (this.subscription) {
                this.subscription.unsubscribe();
            }
            this.subscription = (typeof embed == "boolean" ? timer(0) : embed.loaded).pipe(
                take(1),
                finalize(() => {
                    if (previousElement != null) {
                        previousElement.classList.remove("show");
                        setTimeout(() => previousElement.remove(), 2000);
                    }
                    let test = this.element.offsetLeft;
                    this.element.classList.add("show");
                })
            ).subscribe();
            this.item = feed;
        }
        this.style.setProperty("--aspect-ratio", feed.aspectRatio);
        this.style.setProperty("--source-aspect-ratio", feed.sourceAspectRatio);
        return this.currentEmbed;
    }

    toggleVisibility(visible: boolean, parent: HTMLElement) {
        this.classList.toggle("show", visible);
        if (visible && !parent.contains(this)) {
            parent.appendChild(this);
        } else if (!visible && this.parentElement != null) {
            parent.removeChild(this);
        }
    }

    hasAudio() {
        return this.currentEmbed?.hasAudio ?? false;
    }

    toggleAudio(audio: boolean) {
        this.currentEmbed?.toggleAudio(audio);
    }
}