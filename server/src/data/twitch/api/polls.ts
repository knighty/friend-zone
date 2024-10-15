import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

export type PollResponse = {
    id: string;
    broadcaster_id: string;
    broadcaster_name: string;
    broadcaster_login: string;
    title: string;
    choices: {
        id: string;
        title: string;
        votes: number;
        channel_points_votes: number;
        bits_votes: number;
    }[];
    bits_voting_enabled: boolean;
    bits_per_vote: number;
    channel_points_voting_enabled: boolean;
    channel_points_per_vote: number;
    status: "ACTIVE" | "COMPLETED" | "TERMINATED" | "ARCHIVED" | "MODERATED" | "INVALID";
    duration: number;
    started_at: string;
};

export async function createPoll(authToken: AuthTokenSource, broadcasterId: string, title: string, choices: string[], duration = 60): Promise<PollResponse> {
    duration = Math.max(Math.min(600, duration), 60);
    const response = await twitchRequest<JSONResponse<PollResponse>>({
        method: "POST",
        path: `/helix/polls`,
    }, authToken, {
        broadcaster_id: broadcasterId,
        title,
        choices: choices.map(choice => ({ title: choice })),
        duration,
    });
    if (response.data[0]) {
        return response.data[0];
    }
    throw new Error("Didn't set up a poll for some reason");
};