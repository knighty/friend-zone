import { combineLatestWith, distinctUntilChanged, map, of, scan, share, tap } from "rxjs";
import { socket, socketData } from "../../socket";
import { FriendElement } from "./friend";

export default class FriendsModule extends HTMLElement {
    connectedCallback() {
        const subtitles$ = socket.on("subtitles").pipe(share());
        const feeds$ = socketData.feed$;

        const friendList = document.querySelector(".friend-list");

        socketData.user$.pipe(
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
                        element.bindData("woth", socketData.woth$.pipe(
                            map(woth => (woth.counts[userId] ?? 0).toString()),
                            distinctUntilChanged()
                        ));
                        /*element.bindData("subtitles", subtitles$.pipe(
                            filter(subtitle => subtitle.userId == userId),
                            map(subtitle => ({ id: subtitle.subtitleId, text: subtitle.text }))
                        ));*/
                        element.bindData("voice", socketData.voice$.pipe(
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
            }, [] as HTMLElement[]),
            combineLatestWith(feeds$),
            tap(([elements, feeds]) => {
                for (let element of elements) {
                    element.classList.toggle("visible", feeds.find(feed => feed.user == element.dataset.person) === undefined);
                }
            })
        ).subscribe();
    }
}