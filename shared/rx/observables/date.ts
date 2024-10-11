import { map, startWith, timer } from "rxjs";
export function observeDay() {
    const dt = new Date();
    const secs = dt.getSeconds() + (60 * dt.getMinutes()) + (60 * 60 * dt.getHours());
    return timer(86400 - secs + 100 /* some leeway */, 86400).pipe(
        startWith(0),
        map(() => new Date())
    );
}