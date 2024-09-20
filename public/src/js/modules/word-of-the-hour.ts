import { map } from "rxjs";
import { socket } from "../socket";

namespace Message {
    export type Woth = {
        counts: Record<string, number>,
        word: string
    }
}

export default class WordOfTheHourModule extends HTMLElement {
    connectedCallback() {
        socket.receive<Message.Woth>("woth").pipe(
            map(woth => woth.word),
        ).subscribe(word => {
            this.querySelector(".word").textContent = word;
            this.dataset.state = word ? "show" : "hidden";
        });
    }
}