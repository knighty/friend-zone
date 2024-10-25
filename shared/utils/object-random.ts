import { arrayRandom } from "./array-random";

export function objectRandom<T>(a: Record<string, T>): T | undefined {
    const keys = Object.keys(a);
    const key = arrayRandom(keys);
    if (key == undefined)
        return undefined;
    return a[key];
}