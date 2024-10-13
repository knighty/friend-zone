
export function truncateString(input: string, length: number, addElipses = true, info = false) {
    if (length >= input.length)
        return input;
    let i = input.indexOf(" ", length);
    if (i == -1) {
        i = length;
    }
    return input.substring(0, i) + (addElipses ? "..." : "") + (info ? `[+${input.length - i} more]` : "");
}

export function lastIndexOfRegex(str: string, regex: RegExp) {
    var match = str.match(regex);
    return match ? (str.lastIndexOf(match[match.length - 1]) + match[match.length - 1].length) : -1;
}

export function wordCount(str: string) {
    const matches = str.match(/[\w\d\’\'-]+/gi);
    return matches ? matches.length : 0;
}