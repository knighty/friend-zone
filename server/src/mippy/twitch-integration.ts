import { catchError, EMPTY, exhaustMap, from, merge, Observable, share, tap, throttleTime } from "rxjs";
import { logger } from "shared/logger";
import filterMap from "shared/rx/operators/filter-map";
import { TwitchConfig } from "../config";
import { createPoll, createPrediction } from "../data/twitch/api";
import { UserAuthTokenSource } from "../data/twitch/auth-tokens";
import { ChatGPTMippyBrain } from "./chat-gpt-brain";
import { Mippy } from "./mippy";
import { ToolArguments } from "./tools";

const mippyTwitchLog = logger("mippy-twitch-integration");

export function initMippyTwitchIntegration(mippy: Mippy, brain: ChatGPTMippyBrain, authToken: UserAuthTokenSource, config: TwitchConfig, permissions: Record<string, boolean>) {
    const toolCall$ = brain.receiveToolCalls().pipe(share());
    function tool<T extends keyof ToolArguments>(toolName: T, permission: string = "admin"): Observable<ToolArguments[T]> {
        const checkPermission = (source?: string) => {
            if (permission == "admin") {
                return source == permission;
            }
            return true;
        }
        return toolCall$.pipe(
            filterMap(tool => tool.function.name == toolName && checkPermission(tool.prompt.source), tool => tool.function.arguments)
        );
    }

    function durationToSpeech(duration: number) {
        if (duration >= 60) {
            const minutes = Math.floor(duration / 60);
            return `${minutes} minute${minutes == 1 ? "" : "s"}`;
        }
        return `${duration} seconds`;
    }

    merge(
        tool("createPoll").pipe(
            throttleTime(60000),
            exhaustMap(args => {
                mippy.say(`I just set up a poll titled "${args.title}" for ${durationToSpeech(args.duration)}`);
                mippyTwitchLog.info(`Creating a poll (${args.duration} seconds): \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                if (!permissions.createPoll)
                    return EMPTY;
                return from(createPoll(authToken, config.broadcasterId, args.title, args.options, args.duration)).pipe(
                    tap(result => mippyTwitchLog.info("Successfully set up poll")),
                    catchError(err => { mippyTwitchLog.error(err); return EMPTY; })
                );
            })
        ),

        tool("createPrediction").pipe(
            throttleTime(60000),
            exhaustMap(args => {
                mippy.say(`I just set up a prediction titled "${args.title}" for ${durationToSpeech(args.duration)}`);
                mippyTwitchLog.info(`Creating a prediction: \n${args.title} \n${args.options.map((option, i) => `${i}. ${option}`).join("\n")}`);
                if (!permissions.createPrediction)
                    return EMPTY;
                return from(createPrediction(authToken, config.broadcasterId, args.title, args.options, args.duration)).pipe(
                    tap(result => mippyTwitchLog.info("Successfully set up prediction")),
                    catchError(err => { mippyTwitchLog.error(err); return EMPTY; })
                );
            })
        ),

        tool("changePersonality").pipe(
            tap(args => {
                mippy.say("I got asked to change my personality");
                brain.setPersonality(args.personality);
                mippyTwitchLog.info(`Changing personality:\n${args.personality}`);
            })
        )
    ).subscribe({
        error(err) {
            mippyTwitchLog.error(err);
        }
    });
}