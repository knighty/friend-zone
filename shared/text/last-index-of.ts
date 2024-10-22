export function lastIndexOfRegex(str: string, regex: RegExp) {
    var match = str.match(regex);
    return match ? (str.lastIndexOf(match[match.length - 1]) + match[match.length - 1].length) : -1;
}