import { Observable, combineLatest, map } from "rxjs";
import { observeDay } from "shared/rx";
import { MippyChatGPTConfig } from "../../config";
import Users from "../../data/users";
import { Character } from "../chat-gpt-brain";
import { ChatGPTTools } from "./tools";

export function getSystemPrompt$(config: MippyChatGPTConfig, users: Users, tools: ChatGPTTools, personality$: Observable<string>, character$: Observable<Character>): Observable<string> {
    const userPrompt$ = users.users.values$.pipe(
        map(entries => entries.reduce((a, c) => a + "\n" + c.prompt, ""))
    );
    const tools$ = tools.getSystemPrompt();

    return combineLatest([userPrompt$, personality$, tools$, observeDay()]).pipe(
        map(([users, personality, tools, date]) => {
            let result = config.systemPrompt.prompt.replaceAll("[personality]", personality);
            result = result.replaceAll("[users]", users);
            result = result.replaceAll("[tools]", tools);
            result = result.replaceAll("[date]", date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
            return result;
        })
    )
}

export function getSystem$(config: MippyChatGPTConfig, tools: ChatGPTTools, prompt$: Observable<string>) {
    return combineLatest([prompt$, tools.tools.values$]).pipe(
        map(([systemPrompt, tools]) => ({
            message: {
                role: "system",
                content: systemPrompt
            } as const,
            tools: tools
        }))
    )
}