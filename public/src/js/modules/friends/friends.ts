import { distinctUntilChanged, filter, map, of, scan, share } from "rxjs";
import { socket } from "../../socket";
import { FriendElement } from "./friend";

export default class FriendsModule extends HTMLElement {
    connectedCallback() {
        const users$ = socket.on("users");
        const wothCounts$ = socket.on("woth").pipe(map(woth => woth.counts), share());
        const subtitles$ = socket.on("subtitles").pipe(share());
        const voices$ = socket.on("voice").pipe(share());

        const friendList = document.querySelector(".friend-list");

        users$.pipe(
            scan((elements, users) => {
                let newElements: HTMLElement[] = [];
                console.log(users);
                for (let userId in users) {
                    let user = users[userId];
                    console.log(user);
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