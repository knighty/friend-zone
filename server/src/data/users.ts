import { find, Subject } from "rxjs";
import { ObservableMap } from "shared/rx";

export type User = {
    id: string;
    name: string;
    discordId: string;
    sortKey: number;
    prompt: string;
}

export type UserScreenGrab = {
    id: number;
    user: User;
    screen: Buffer;
}

export default class Users {
    users = new ObservableMap<string, User>();
    requestScreenGrab$ = new Subject<User>();
    screenGrabs$ = new Subject<UserScreenGrab>();

    requestScreenGrab(user: User) {
        this.requestScreenGrab$.next(user);
        return this.screenGrabs$.pipe(
            find(data => data.user == user)
        );
    }

    register(id: string, user: User) {
        this.users.set(id, user);
        return {
            unregister: () => this.users.delete(id)
        }
    }

    remove(id: string) {
        this.users.delete(id);
    }

    observe() {
        return this.users.entries$;
    }
}