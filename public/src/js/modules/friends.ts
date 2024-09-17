import { BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, endWith, exhaustMap, filter, interval, map, Observable, scan, share, startWith, Subject, switchMap, takeWhile, tap } from "rxjs"
import { socket } from "../socket"

type SubtitleMessage = {
    id: number,
    text: string
}

namespace SocketMessageData {
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
        userId: number
    }
    export type Users = Record<string, {
        id: string,
        name: string,
        discordId: string
    }>
}

export default class FriendsModule extends HTMLElement {
    getPersonElement(id: string): HTMLElement {
        return document.querySelector(`.friend-list [data-person=${id}]`) as HTMLElement;
    }

    connectedCallback() {
        const subtitles$: Record<string, Subject<SubtitleMessage>> = {};

        const usersUpdated$ = new BehaviorSubject<boolean>(true);
        const wothMessage$ = socket.receive<SocketMessageData.Woth>("woth").pipe(share());
        const wothCounts$ = wothMessage$.pipe(
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

        socket.receive<SocketMessageData.Voice>("voice").subscribe(data => {
            for (let el of document.querySelectorAll<HTMLElement>(".friend-list [data-person]")) {
                el.classList.toggle("speaking", !!data.users[el.dataset.discordId]);
            }
        });

        socket.receive<SocketMessageData.Subtitles>("subtitles").subscribe(subtitle => {
            subtitles$[subtitle.userId].next({
                id: subtitle.subtitleId,
                text: subtitle.text
            });
        });

        socket.receive<SocketMessageData.Users>("users").subscribe(users => {
            const friendList = document.querySelector(".friend-list");
            const elements = Array.from(friendList.querySelectorAll<HTMLElement>(`[data-person]`));
            for (let userId in users) {
                let user = users[userId];
                let element = elements.find(element => element.dataset.person == userId.toLowerCase());
                if (!element) {
                    element = document.createElement("li");
                    element.dataset.discordId = user.discordId;
                    element.dataset.person = userId.toLowerCase();
                    element.innerHTML = `<div class="user">
                        <span class="name">${user.name}</span>
                        <span class="count">0</span>
                    </div>
                    <div class="speaker"></div>
                    <div class="subtitles"></div>`
                    friendList.appendChild(element);

                    const subtitlesElement = element.querySelector(".subtitles");
                    subtitles$[userId] = new Subject<SubtitleMessage>();
                    subtitles$[userId].pipe(
                        filter(e => e.text != ""),
                        scan((a, c) => {
                            if (a.id == c.id) {
                                a.updateText(c.text);
                                return a;
                            } else {
                                const subject$ = new Subject<string>();
                                let cursor = 0;
                                let text = "";
                                a.id = c.id;
                                a.observable = subject$.pipe(
                                    startWith(c.text),
                                    tap(message => text = message),
                                    exhaustMap(() => {
                                        return interval(30).pipe(
                                            tap(() => cursor++),
                                            takeWhile(c => cursor <= text.length),
                                            endWith(1),
                                            map(() => text.substring(0, cursor)),
                                        )
                                    })
                                );
                                a.updateText = (t: string) => subject$.next(t);
                                return a;
                            }
                        }, { id: -1, observable: null, updateText: null } as { id: number, observable: Observable<string>, updateText: (text: string) => void }),
                        map(state => state.observable),
                        distinctUntilChanged(),
                        switchMap(observable => observable),
                        tap(message => {
                            subtitlesElement.textContent = message;
                            subtitlesElement.scrollTo(0, subtitlesElement.scrollHeight);
                        }),
                        tap(message => subtitlesElement.classList.add("show")),
                        debounceTime(3000),
                        tap(message => subtitlesElement.classList.remove("show")),
                    ).subscribe();
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
            usersUpdated$.next(true);
        });
    }
}