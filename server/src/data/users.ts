import { BehaviorSubject, map } from "rxjs";

export type Person = {
    name: string;
    discordId: string;
    sortKey: number;
}

export class Users {
    users = new Map<string, Person>();
    updated$ = new BehaviorSubject<Users>(this);

    constructor() {

    }

    addPerson(id: string, discordId: string, name: string, sortKey: number) {
        this.users.set(id, {
            name: name,
            discordId: discordId,
            sortKey: sortKey
        });
        this.updated$.next(this);
    }

    removePerson(id: string) {
        this.users.delete(id);
        this.updated$.next(this);
    }

    observeUsers() {
        return this.updated$.pipe(
            map(() => Object.fromEntries(this.users))
        )
    }
}

/*export function getUsers() {
    function addPerson(map: Map<string, Person>, discordId: string, name: string) {
        map.set(name.toLowerCase(), {
            name: name,
            discordId: discordId
        });
    }

    const users: Map<string, Person> = new Map<string, Person>();
    addPerson(users, "127142947501113344", "PHN");
    addPerson(users, "63090045694783488", "knighty");
    addPerson(users, "185043057350148097", "Dan");
    addPerson(users, "151145966559428609", "Leth");

    return users;
}*/