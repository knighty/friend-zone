import { filter } from "rxjs";

export function equals<In>(test: In) {
    return filter<In>(value => value == test);
}