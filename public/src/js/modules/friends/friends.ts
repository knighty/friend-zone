import { distinctUntilChanged, filter, map, of, scan, share } from "rxjs"
import { socket } from "../../socket"
import { FriendElement } from "./friend"

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
                    let element: FriendElement = elements.find(element => element.dataset.person == userId.toLowerCase()) as FriendElement;
                    if (!element) {
                        element = new FriendElement();
                        element.dataset.person = userId;
                        element.bindData("woth", wothCounts$.pipe(
                            map(counts => (counts[userId] ?? 0).toString()),
                            distinctUntilChanged()
                        ));
                        element.bindData("subtitles", subtitles$.pipe(
                            filter(subtitle => subtitle.userId == userId),
                            map(subtitle => ({ id: subtitle.subtitleId, text: subtitle.text }))
                        ));
                        element.bindData("voice", voices$.pipe(
                            map(users => !!users[user.discordId]),
                            distinctUntilChanged(),
                        ))
                        element.bindData("name", of(user.name));
                        element.dataset.sortKey = user.sortKey.toString();
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
            }, [] as HTMLElement[])
        ).subscribe();
    }
}