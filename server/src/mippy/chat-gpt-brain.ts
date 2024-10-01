import OpenAI from 'openai';
import { concatMap, firstValueFrom, from, map, Observable, share, Subject, tap } from "rxjs";
import { logger } from "shared/logger";
import { isMippyEnabledConfig, MippyConfig } from "../config";
import Users from '../data/users';
import { MippyBrain, MippyMessage, MippyPrompts, Prompt } from "./mippy-brain";

const log = logger("mippy-chat-gpt-brain", false);

export class ChatGPTMippyBrain implements MippyBrain {
    prompt$ = new Subject<Prompt>();
    messages$: Observable<MippyMessage>;
    config: MippyConfig;
    users: Users;

    constructor(apiKey: string, config: MippyConfig, users: Users) {
        this.config = config;
        this.users = users;

        const client = new OpenAI({
            apiKey: apiKey,
        });

        this.messages$ = this.prompt$.pipe(
            concatMap(prompt$ => {
                const prompt = prompt$.text;
                log.info(`Prompt: ${prompt}`);
                const params: OpenAI.Chat.ChatCompletionCreateParams = {
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    model: 'gpt-3.5-turbo',
                };
                return from(client.chat.completions.create(params)).pipe(
                    map(result => ({
                        text: result.choices[0].message.content
                    })),
                    tap(result => {
                        log.info(`Result: ${result.text}`)
                    })
                );
            }),
            share(),
        );
    }

    getUserPrompt() {
        return firstValueFrom(this.users.users.values$.pipe(
            map(entries => entries.reduce((a, c) => a + "\n" + c.prompt, ""))
        ))
    }

    receive(): Observable<MippyMessage> {
        return this.messages$;
    }

    async ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data) {
        if (isMippyEnabledConfig(this.config)) {
            let prompt = this.config.prompts[event];
            if (!prompt)
                return;

            if (this.config.prompt)
                prompt = `${this.config.prompt}\n\n${prompt}`;

            const extraData: Record<string, string> = {
                users: await this.getUserPrompt()
            }
            for (let key in data) {
                prompt = prompt.replace(`[${key}]`, data[key].toString());
            }
            for (let key in extraData) {
                prompt = prompt.replace(`[${key}]`, extraData[key].toString());
            }

            this.prompt$.next({
                text: prompt
            });
        }
    }
}