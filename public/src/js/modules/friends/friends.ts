import { BehaviorSubject, combineLatest, map, tap } from "rxjs"
import { socket } from "../../socket"
import { SubtitlesElement } from "./subtitles"

namespace Message {
    export type Woth = {
        counts: Record<string, number>,
        word: string
    }
    export type Voice = {
        users: Record<string, boolean>
    }
    export type Subtitles = {
        subtitleId: number,
        text: string,
        userId: string
    }
    export type Users = Record<string, {
        id: string,
        name: string,
        discordId: string,
        sortKey: number
    }>
}

export default class FriendsModule extends HTMLElement {
    getPersonElement(id: string): HTMLElement {
        return document.querySelector(`.friend-list [data-person=${id}]`) as HTMLElement;
    }

    connectedCallback() {
        const usersUpdated$ = new BehaviorSubject<boolean>(true);
        const wothCounts$ = socket.receive<Message.Woth>("woth").pipe(
            map(woth => woth.counts)
        );
        const wothCountUpdates$ = combineLatest([wothCounts$, usersUpdated$]).pipe(
            map(([counts, i]) => counts),
            tap(counts => {
                for (let id in counts) {
                    const count = counts[id];
                    const element = this.getPersonElement(id);
                    if (element) {
                        const countElement = element.querySelector(".count");
                        if (Number(countElement.textContent) !== count) {
                            element.classList.remove("animation");
                            element.offsetWidth;
                            element.classList.add("animation");
                            countElement.textContent = count.toString();
                        }
                    }
                }
            })
        )
        wothCountUpdates$.subscribe();

        socket.receive<Message.Voice>("voice").subscribe(data => {
            for (let el of document.querySelectorAll<HTMLElement>(".friend-list [data-person]")) {
                el.classList.toggle("speaking", !!data.users[el.dataset.discordId]);
            }
        });

        socket.receive<Message.Subtitles>("subtitles").subscribe(subtitle => {
            const personElement = this.getPersonElement(subtitle.userId);
            const subtitlesElement = personElement.querySelector<SubtitlesElement>(".subtitles");
            subtitlesElement.updateSubtitles({
                id: subtitle.subtitleId,
                text: subtitle.text
            });
        });

        socket.receive<Message.Users>("users").subscribe(users => {
            const friendList = document.querySelector(".friend-list");
            const elements = Array.from(friendList.querySelectorAll<HTMLElement>(`[data-person]`));
            for (let userId in users) {
                let user = users[userId];
                let element = elements.find(element => element.dataset.person == userId.toLowerCase());
                if (!element) {
                    element = document.createElement("li");
                    element.dataset.discordId = user.discordId;
                    element.dataset.sortKey = user.sortKey.toString();
                    element.dataset.person = userId.toLowerCase();
                    element.innerHTML = `<div class="user">
                        <span class="name">${user.name}</span>
                        <span class="count">0</span>
                        <div class="speaker"></div>
                    </div>
                    <x-subtitles class="subtitles"></x-subtitles>`
                    friendList.appendChild(element);
                } else {
                    const index = elements.indexOf(element);
                    if (index !== -1) {
                        elements.splice(index, 1);
                    }
                }
            }
            for (let element of elements) {
                element.remove();
            }
            Array.from(friendList.querySelectorAll<HTMLElement>(`[data-person]`))
                .map(element => ({ sort: Number(element.dataset.sortKey), element }))
                .sort((a, b) => a.sort - b.sort)
                .forEach(e => friendList.appendChild(e.element));
            usersUpdated$.next(true);
        });
    }
}