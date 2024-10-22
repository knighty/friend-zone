export function truncateString(input: string, length: number, addElipses = true, info = false) {
    if (length >= input.length)
        return input;
    let i = input.indexOf(" ", length);
    if (i == -1) {
        i = length;
    }
    return input.substring(0, i) + (addElipses ? "..." : "") + (info ? `[+${input.length - i} more]` : "");
}