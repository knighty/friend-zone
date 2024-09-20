import { BehaviorSubject, combineLatest, map, shareReplay, tap } from "rxjs"
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

        const users$ = socket.receive<Message.Users>("users").pipe(
            shareReplay(1)
        );

        let userElements: HTMLElement[] = [];

        socket.receive<Message.Voice>("voice").subscribe(data => {
            for (let el of userElements) {
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

        users$.pipe(
            tap(users => {
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
                userElements = Array.from(friendList.querySelectorAll<HTMLElement>(`[data-person]`));
                userElements
                    .map(element => ({ sort: Number(element.dataset.sortKey), element }))
                    .sort((a, b) => a.sort - b.sort)
                    .forEach(e => friendList.appendChild(e.element));
                usersUpdated$.next(true);
            }),
            /*switchMap(users => {
                const voiceMap: Record<string, number> = {};
                for (let user in users) {
                    voiceMap[users[user].discordId] = 0;
                }
                const updaters$ = merge(
                    renderLoop$.pipe(map(() => (voiceMap: Record<string, number>) => {
                        for (let s in voiceMap) {
                            voiceMap[s] = voiceMap[s] * 0.97;
                        }
                        return voiceMap;
                    })),
                    socket.receive<Message.Voice>("voice").pipe(map(voices => (voiceMap: Record<string, number>) => {
                        for (let s in voices.users) {
                            voiceMap[s] = 1;
                        }
                        return voiceMap;
                    }))
                );
                const voices$ = updaters$.pipe(
                    scan((state, update) => update(state), voiceMap),
                    share()
                );
                let obs = [];
                for (let user in users) {
                    const discordId = users[user].discordId;
                    const element = userElements.find(element => element.dataset.discordId == discordId);
                    if (!element)
                        continue;
                    obs.push(
                        voices$.pipe(
                            map(voices => Math.floor(voices[discordId] * 3 + 0.5)),
                            distinctUntilChanged(),
                            tap(level => element.dataset.voiceLevel = level.toString())
                        )
                    )
                }
                return merge(...obs);
            })*/
        ).subscribe();
    }
}