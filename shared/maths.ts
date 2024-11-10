export function clamp(value: number, min = 0, max = 1) {
    return Math.max(Math.min(max, value), min);
}