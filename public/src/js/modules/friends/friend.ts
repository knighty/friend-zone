import { CustomElement } from "shared/html/custom-element";
import { SubtitlesElement } from "./subtitles";

const template = `<div class="user">
<svg viewBox="0 -2 96 24" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
	<defs>
		<path id="path" d="M 14 2 L 78 2 L 70 18 L 6 18 Z"></path>
		<path id="path2" d="M 8 4 L 80 4 L 72 20 L 0 20 Z"></path>
	</defs>
	<use xlink:href="#path2" fill="none" stroke="#8333da" style="stroke-width: var(--stroke-width); transition: stroke-width: 0.2s;" stroke-linejoin="round" stroke-linecap="round"></use>
	<use xlink:href="#path" style="fill: var(--background-fill); transition: fill 0.2s;"></use>
	<use xlink:href="#path" fill="none" style="stroke:var(--dark-border); transition: stroke 0.2s;" stroke-width="0.6" stroke-linejoin="round" stroke-linecap="round"></use>
	<use xlink:href="#path" fill="none" style="stroke:var(--light-border); transition: stroke 0.2s; stroke-dashoffset: -72%;" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="82">
		<!--<animate attributeName="stroke-dashoffset" values="0;164" dur="8s" repeatCount="indefinite" />-->
	</use>
</svg>
    <span class="name" data-element="name"></span>
    <span class="count" data-element="count">0</span>
    <div class="speaker"></div>
</div>
<x-subtitles class="subtitles" data-element="subtitles"></x-subtitles>`

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
        test: HTMLInputElement
    }
}> {
    setup() {
        this.innerHTML = template;
        this.element("subtitles").bindData("subtitles", this.registerHandler("subtitles"));
        this.classList.add("visible");
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