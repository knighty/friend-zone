export function arrayRandom<T>(a: Array<T>): T | undefined {
    if (a.length == 0)
        return undefined;
    return a[Math.floor(Math.random() * a.length)];
}