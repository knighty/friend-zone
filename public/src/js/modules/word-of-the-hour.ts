import { map } from "rxjs";
import { CustomElement } from "shared/html/custom-element";
import { socket } from "../socket";

namespace Message {
    export type Woth = {
        counts: Record<string, number>,
        word: string
    }
}

export default class WordOfTheHourModule extends CustomElement<{
    Data: {
        woth: string
    },
    Elements: {
        word: HTMLElement
    }
}> {
    setup() {
        this.bindData("woth", socket.on("woth").pipe(
            map(woth => woth.word),
        ));
        this.elements = {
            word: this.querySelector(".word")
        }
    }
    connect() {
        this.registerHandler("woth").subscribe(word => {
            this.element("word").textContent = word;
            this.dataset.state = word ? "show" : "hidden";
        });
    }
}