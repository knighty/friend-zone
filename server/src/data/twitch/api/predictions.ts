import { twitchRequest } from "../api";
import { UserAuthTokenSource } from "../auth-tokens";
import { JSONResponse } from "./request";

type Status = "CANCELED" | "LOCKED" | "RESOLVED";

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

export async function createPrediction(authToken: UserAuthTokenSource, broadcasterId: string, title: string, outcomes: string[], duration = 60): Promise<PredictionResponse> {
    duration = Math.max(Math.min(600, duration), 60);
    const response = await twitchRequest<JSONResponse<PredictionResponse>>({
        method: "POST",
        path: `/helix/predictions`,
    }, authToken, {
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

export async function endPrediction(authToken: UserAuthTokenSource, broadcasterId: string, id: string, status: "RESOLVED", winningOutcomeId: string): Promise<PredictionResponse>;
export async function endPrediction(authToken: UserAuthTokenSource, broadcasterId: string, id: string, status: "CANCELED" | "LOCKED"): Promise<PredictionResponse>;
export async function endPrediction(authToken: UserAuthTokenSource, broadcasterId: string, id: string, status: Status, winningOutcomeId?: string): Promise<PredictionResponse> {
    const response = await twitchRequest<JSONResponse<PredictionResponse>>({
        method: "PATCH",
        path: `/helix/predictions`,
    }, authToken, {
        broadcaster_id: broadcasterId,
        id: id,
        status: status,
        winning_outcome_id: winningOutcomeId,
    });
    if (response.data[0]) {
        return response.data[0];
    }
    throw new Error("Didn't set up a prediction for some reason");
}