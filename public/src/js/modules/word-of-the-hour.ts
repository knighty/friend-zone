import { map, share, tap } from "rxjs";
import { socket } from "../socket";

namespace SocketMessageData {
    export type Woth = {
        counts: Record<string, number>,
        word: string
    }
}

export default class WordOfTheHourModule extends HTMLElement {
    connectedCallback() {
        const wothMessage$ = socket.receive<SocketMessageData.Woth>("woth").pipe(share());
        const wothUpdated$ = wothMessage$.pipe(
            map(woth => woth.word),
            tap(word => {
                const wordElement = this.querySelector(".word");
                if (wordElement) wordElement.textContent = word;
                const wothElement = this.querySelector<HTMLElement>(".word-of-the-hour");
                this.dataset.state = word ? "show" : "hidden";
            })
        )
        wothUpdated$.subscribe();
    }
}