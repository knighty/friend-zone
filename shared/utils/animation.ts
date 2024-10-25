import { animationFrames, endWith, map, takeWhile } from "rxjs";
import { curves } from "../utils";

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
    const { start = 0, end = 1, curve = curves.easeInOutSine } = options;

    return animationFrames().pipe(
        map(v => v.elapsed / (1000 * durationSeconds)),
        takeWhile(v => v < 1),
        map(curve),
        map(v => start + (end - start) * v),
        endWith(end)
    );
}