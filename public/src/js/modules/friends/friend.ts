import { CustomElement } from "shared/html/custom-element";
import { SubtitlesElement } from "./subtitles";

const template = `<div class="user">
    <span class="name"></span>
    <span class="count">0</span>
    <div class="speaker"></div>
</div>
<x-subtitles class="subtitles"></x-subtitles>`

type Sub = { id: number, text: string };

export class FriendElement extends CustomElement<{
    Data: {
        woth: string,
        subtitles: Sub,
        voice: boolean,
        name: string
    },
    Elements: {
        name: HTMLElement,
        count: HTMLElement,
        subtitles: SubtitlesElement,
    }
}> {
    setup() {
        this.innerHTML = template;
        this.elements = {
            name: this.querySelector(".name"),
            count: this.querySelector(".count"),
            subtitles: this.querySelector<SubtitlesElement>("x-subtitles")
        };
        this.elements.subtitles.bindData("subtitles", this.registerHandler("subtitles"));
    }

    connect() {
        this.registerHandler("name").subscribe(name => this.element("name").textContent = name);
        this.registerHandler("woth").subscribe(count => {
            this.classList.remove("animation");
            this.offsetWidth;
            this.classList.add("animation");
            this.element("count").textContent = (count ?? 0).toString();
        });
        this.registerHandler("voice").subscribe(speaking => this.classList.toggle("speaking", speaking));
    }
}