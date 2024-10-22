import { animationFrames, endWith, map, takeWhile } from "rxjs";

function easeOutBack(x: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;

    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Observable for an animation over values from start to end over duration
 * @param durationSeconds How long to interpolate for in seconds
 * @param start The starting value to interpolate from
 * @param end End value to interpolate to
 * @returns 
 */
export function animation(durationSeconds: number, options: {
    start?: number;
    end?: number;
    curve?: (num: number) => number
} = {}) {
    const { start = 0, end = 1, curve = (num: number) => num } = options;

    return animationFrames().pipe(
        map(v => v.elapsed / (1000 * durationSeconds)),
        takeWhile(v => v < 1),
        map(easeOutBack),
        map(v => start + (end - start) * v),
        endWith(end)
    );
}