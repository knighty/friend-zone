import { ObservableMap } from "shared/rx/observables/map";

export type User = {
    name: string;
    discordId: string;
    sortKey: number;
    prompt: string;
}

export default class Users {
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