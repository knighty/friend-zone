import { ObservableMap } from "shared/rx/observable-map";

export type User = {
    name: string;
    discordId: string;
    sortKey: number;
}

export class Users {
    users = new ObservableMap<string, User>();

    add(id: string, user: User) {
        this.users.set(id, user);
    }

    remove(id: string) {
        this.users.delete(id);
    }

    observe() {
        return this.users.entries$;
    }
}