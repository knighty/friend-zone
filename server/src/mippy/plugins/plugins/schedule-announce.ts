import { EMPTY, interval, Observable, switchMap, throttleTime } from "rxjs";
import { getSchedule } from "../../../data/twitch/api";
import { Schedule } from "../../../data/twitch/api/schedule";
import { AuthTokenSource } from "../../../data/twitch/auth-tokens";
import { MippyPluginConfig, MippyPluginConfigDefinition, MippyPluginDefinition } from "../plugins";

function getDay(date: Date) {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
}

const pluginConfig = {
    frequency: {
        name: "Frequency",
        description: "How frequently the schedule is announced (minutes)",
        type: "number",
        default: 10,
        max: 60,
        min: 0,
        step: 1
    }
} satisfies MippyPluginConfigDefinition;

export function scheduleAnnouncePlugin(userToken: AuthTokenSource, broadcasterId: string, sayGoodbye$: Observable<void>): MippyPluginDefinition {
    function formatSegment(segment: {
        title: string,
        start_time: string
    }) {
        const date = new Date(new Date(segment.start_time).getTime() - 1000 * 60 * 60 * 8);
        return `${getDay(date)}: ${segment.title}`;
    }

    function getWeekSchedule(schedule: Schedule) {
        const now = Date.now();
        return schedule.segments.filter(segment => {
            const date = new Date(segment.start_time);
            return date.getTime() < now + 86400 * 7 * 1000;
        })
    }

    return {
        name: "Schedule Announcer",
        permissions: ["sendMessage"],
        config: pluginConfig,
        async init(mippy, config: MippyPluginConfig<typeof pluginConfig>) {
            let i = 0;

            const frequency$ = config.observe("frequency");

            frequency$.pipe(
                switchMap(frequency => {
                    if (!frequency)
                        return EMPTY;
                    return interval(frequency * 1000 * 60).pipe(
                        switchMap(i => getSchedule(userToken, broadcasterId))
                    )
                })
            ).subscribe(schedule => {
                const thisWeekSegments = getWeekSchedule(schedule);
                if (thisWeekSegments.length == 0)
                    return;

                const segment = thisWeekSegments[(i++) % thisWeekSegments.length];
                mippy.ask("scheduleAnnounce", {
                    schedule: formatSegment(segment)
                }, { store: false })
            });

            sayGoodbye$.pipe(
                throttleTime(1000 * 60),
                switchMap(i => getSchedule(userToken, broadcasterId))
            ).subscribe(schedule => {
                const thisWeekSegments = getWeekSchedule(schedule);
                mippy.ask("sayGoodbye", {
                    schedule: thisWeekSegments.map(formatSegment).join("\n")
                }, { store: false, role: "system" })
            })

            return {
                disable() {

                },
            };
        },
    }
}