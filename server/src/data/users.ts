export type Person = {
    name: string;
    count: number;
    discordId: string;
}

export function getUsers() {
    function addPerson(map: Map<string, Person>, discordId: string, name: string) {
        map.set(name.toLowerCase(), {
            name: name,
            count: 0,
            discordId: discordId
        });
    }

    const users: Map<string, Person> = new Map<string, Person>();
    addPerson(users, "127142947501113344", "PHN");
    addPerson(users, "63090045694783488", "knighty");
    addPerson(users, "185043057350148097", "Dan");
    addPerson(users, "151145966559428609", "Leth");

    return users;
}
