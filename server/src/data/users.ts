import { ObservableMap } from "shared/rx/observables/map";

export type User = {
    id: string;
    name: string;
    discordId: string;
    sortKey: number;
    prompt: string;
}

export default class Users {
    users = new ObservableMap<string, User>();

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