import { twitchRequest } from "../api";
import { AuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

export type PredictionResponse = {
    id: string;
    broadcaster_id: string;
    broadcaster_name: string;
    broadcaster_login: string;
    title: string;
    winning_outcome_id: number | null;
    outcomes: {
        id: string;
        title: string;
        users: number;
        channel_points: number;
        top_predictors: null;
        color: string;
    }[];
    prediction_window: number;
    status: "ACTIVE" | "CANCELED" | "LOCKED" | "RESOLVED";
    created_at: string;
    ended_at: null;
    locked_at: null;
};

export async function createPrediction(authToken: AuthTokenSource, broadcasterId: string, title: string, outcomes: string[], duration = 60): Promise<PredictionResponse> {
    duration = Math.max(Math.min(600, duration), 60);
    const response = await twitchRequest<JSONResponse<PredictionResponse>>({
        method: "POST",
        path: `/helix/predictions`,
    }, authToken, true, {
        broadcaster_id: broadcasterId,
        title,
        outcomes: outcomes.map(choice => ({ title: choice })),
        prediction_window: duration,
    });
    if (response.data[0]) {
        return response.data[0];
    }
    throw new Error("Didn't set up a prediction for some reason");
}