import { distinctUntilChanged, filter, map, merge, scan, share, switchMap, tap } from "rxjs"
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
    connectedCallback() {
        const users$ = socket.receive<Message.Users>("users");
        const wothCounts$ = socket.receive<Message.Woth>("woth").pipe(map(woth => woth.counts), share());
        const subtitles$ = socket.receive<Message.Subtitles>("subtitles").pipe(share());
        const voices$ = socket.receive<Message.Voice>("voice").pipe(map(data => data.users), share());

        const friendList = document.querySelector(".friend-list");

        users$.pipe(
            scan((elements, users) => {
                let newElements: HTMLElement[] = [];
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
                        newElements.push(element);
                    }
                    newElements.push(element);
                }
                for (let element of elements) {
                    if (!newElements.includes(element)) {
                        element.remove();
                    }
                }
                newElements
                    .map(element => ({ sort: Number(element.dataset.sortKey), element }))
                    .sort((a, b) => a.sort - b.sort)
                    .forEach(e => friendList.appendChild(e.element));
                return newElements;
            }, [] as HTMLElement[]),
            switchMap(userElements => {
                const subtitleUpdates$ = merge(...userElements.map(element => {
                    const subtitlesElement = element.querySelector<SubtitlesElement>(".subtitles");
                    const userId = element.dataset.person;
                    return subtitles$.pipe(
                        filter(subtitle => subtitle.userId == userId),
                        tap(subtitle => subtitlesElement.updateSubtitles({
                            id: subtitle.subtitleId,
                            text: subtitle.text
                        }))
                    )
                }));
                const wothupdates$ = merge(...userElements.map(element => {
                    const countElement = element.querySelector(".count");
                    const userId = element.dataset.person;
                    return wothCounts$.pipe(
                        map(counts => counts[userId]),
                        distinctUntilChanged(),
                        tap(count => {
                            element.classList.remove("animation");
                            element.offsetWidth;
                            element.classList.add("animation");
                            countElement.textContent = (count ?? 0).toString();
                        })
                    )
                }));
                const voiceUpdates$ = merge(...userElements.map(element => {
                    const discordId = element.dataset.discordId;
                    return voices$.pipe(
                        map(users => !!users[discordId]),
                        distinctUntilChanged(),
                        tap(speaking => element.classList.toggle("speaking", speaking))
                    )
                }));
                return merge(voiceUpdates$, wothupdates$, subtitleUpdates$);
            })
        ).subscribe();
    }
}