import { animationFrames, filter, map, pairwise, share, skip } from "rxjs";

export const renderLoop$ = animationFrames().pipe(
    skip(1),
    pairwise(),
    map(([a, b]) => {
        return { dt: (b.timestamp - a.timestamp) / 1000, timestamp: b.timestamp / 1000 };
    }),
    filter(frame => frame.dt < 0.1),
    share()
);
