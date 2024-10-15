import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";

export type Schedule = {
    segments:
    {
        id: string,
        start_time: string,
        end_time: string,
        title: string,
        canceled_until: string | null,
        category: {
            id: string,
            name: string
        },
        is_recurring: boolean
    }[],
    broadcaster_id: string,
    broadcaster_name: string,
    broadcaster_login: string,
    vacation: null | {
        start_time: string,
        end_time: string,
    }
}

export async function getSchedule(authToken: AuthTokenSource, broadcasterId: string): Promise<Schedule> {
    const response = await twitchRequest<{ data: Schedule }>({
        method: "GET",
        path: `/helix/schedule`,
        params: {
            broadcaster_id: broadcasterId
        }
    }, authToken);

    return response.data;
};