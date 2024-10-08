import { green } from 'kolorist';
import OpenAI from 'openai';
import { BehaviorSubject, catchError, combineLatest, concatMap, debounceTime, EMPTY, exhaustMap, filter, from, map, mergeMap, Observable, share, Subject, switchMap, throttleTime, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { executionTimer } from 'shared/utils';
import { isMippyChatGPT, MippyChatGPTConfig } from "../config";
import Users from '../data/users';
import { MippyBrain, MippyMessage, MippyPrompts, Prompt } from "./mippy-brain";
import { MippyHistoryMessage, MippyMessageRepository } from './storage';
import { toolsSchema } from './tools';

const log = logger("mippy-chat-gpt-brain", true);

export type ToolCall<Args = any> = {
    id: string,
    function: { name: string, arguments: Args },
    prompt: Prompt
}

function chatgptMessage(role: "system" | "user" | "assistant", content: string) {
    return { role, content }
}

const logError = <In>() => catchError<In, typeof EMPTY>(e => { log.error(e); return EMPTY; });

export class ChatGPTMippyBrain implements MippyBrain {
    prompt$ = new Subject<Prompt>();
    messages$: Observable<MippyMessage>;
    config: MippyChatGPTConfig;
    users: Users;
    personality$ = new BehaviorSubject<string>("");
    tools$ = new BehaviorSubject<Record<string, string>>({});
    messageRepository: MippyMessageRepository;

    constructor(apiKey: string, config: MippyChatGPTConfig, users: Users, messageRepository: MippyMessageRepository) {
        this.config = config;
        this.users = users;
        this.messageRepository = messageRepository;

        this.tools$.next(config.systemPrompt.tools);

        const client = new OpenAI({
            apiKey: apiKey,
        });

        const userPrompt$ = this.users.users.values$.pipe(
            map(entries => entries.reduce((a, c) => a + "\n" + c.prompt, ""))
        );
        const personality$ = this.personality$.pipe(
            map(personality => personality == null ? config.systemPrompt.personality : personality)
        )
        const toolPrompt$ = this.tools$.pipe(
            map(tools => Object.keys(tools).map(key => `## ${key}\n${tools[key]}`).join("\n\n"))
        )
        const systemPrompt$ = combineLatest([userPrompt$, personality$, toolPrompt$]).pipe(
            map(([users, personality, tools]) => {
                let result = config.systemPrompt.prompt.replaceAll("[personality]", personality);
                result = result.replaceAll("[users]", users);
                result = result.replaceAll("[tools]", tools);
                return result;
            })
        )
        const toolsSchema$ = this.tools$.pipe(
            map(tools => toolsSchema.filter(tool => !!tools[tool.function.name])),
        )
        const system$ = combineLatest([systemPrompt$, toolsSchema$]).pipe(
            map(([systemPrompt, toolsSchema]) => ({
                message: chatgptMessage("system", systemPrompt),
                toolsSchema: toolsSchema
            }))
        )

        const history$ = from(messageRepository.getHistory()).pipe(
            share()
        )

        history$.pipe(
            switchMap(history => history.updated$),
            debounceTime(5000),
            throttleTime(60000, undefined, { leading: true, trailing: true }),
            exhaustMap(history => this.messageRepository.persistHistory(history))
        ).subscribe()

        this.messages$ = history$.pipe(
            switchMap(history => {
                return this.prompt$.pipe(
                    withLatestFrom(system$),
                    concatMap(async ([prompt, system]) => {
                        const store = prompt.store === undefined ? true : prompt.store;
                        const userMessage = history.create("user", prompt.text, prompt.name);
                        const allowTools = prompt.allowTools && prompt.source == "admin";

                        log.info(`Prompt: ${green(prompt.text)}`);
                        log.info(`History: ${green(history.messages.length)} messages. Tools: ${allowTools ? system.toolsSchema.map(tool => green(tool.function.name)).join(", ") : green("not allowed")}`);

                        const chatGptTimer = executionTimer();
                        const summarise = async (messages: MippyHistoryMessage[]) => {
                            const params: OpenAI.Chat.ChatCompletionCreateParams = {
                                messages: [
                                    system.message,
                                    ...messages,
                                    history.create("user", "Summarise the important parts of the chat up until now in a few paragraphs"),
                                ],
                                model: "gpt-4o-mini",
                            };
                            const m = await client.chat.completions.create(params);
                            return m.choices[0].message.content ?? "";
                        }

                        if (store) {
                            await history.addMessage(userMessage, summarise);
                        }

                        const response = await client.chat.completions.create({
                            messages: [
                                system.message,
                                ...history.summaries,
                                ...history.messages,
                                ...(store ? [] : [userMessage])
                            ],
                            model: "gpt-4o-mini",
                            tool_choice: allowTools ? "auto" : undefined,
                            tools: allowTools ? system.toolsSchema : undefined
                        });
                        const message = response.choices[0].message;
                        const result = {
                            text: message.content ?? message.refusal ?? "",
                            tool: message.tool_calls,
                            prompt: prompt
                        };

                        log.info(`Response (${green(chatGptTimer.end())} - ${green(response.usage?.total_tokens.toString() ?? "")} tokens): ${green(result.text)}`);
                        if (store) {
                            await history.addMessage(history.create("assistant", result.text ?? ""), summarise);
                        }
                        return result;
                    }),
                )
            }),
            share(),
        );
    }

    setPersonality(personality: string) {
        if (personality == "reset") {
            this.personality$.next(this.config.systemPrompt.prompt);
        } else {
            this.personality$.next(personality);
        }
    }

    receive(): Observable<MippyMessage> {
        return this.messages$.pipe(
            filter(result => !!result.text)
        );
    }

    receiveToolCalls() {
        return this.messages$.pipe(
            filter(message => message.tool != undefined),
            mergeMap(message => {
                const tools: ToolCall[] = [];
                if (message.tool != undefined) {
                    for (let tool of message.tool) {
                        try {
                            const args = JSON.parse(tool.function.arguments);
                            tools.push({
                                id: tool.id,
                                function: {
                                    name: tool.function.name,
                                    arguments: args,
                                },
                                prompt: message.prompt

                            });
                        } catch (e) {
                            log.error("Error parsing arguments");
                        }
                    }
                }
                return from(tools);
            })
        )
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, prompt: Omit<Prompt, "text">) {
        if (isMippyChatGPT(this.config)) {
            let promptTemplate = this.config.prompts[event];
            if (!promptTemplate)
                return;

            for (let key in data) {
                if (data[key]) {
                    promptTemplate = promptTemplate.replace(`[${key}]`, data[key].toString());
                }
            }

            this.prompt$.next({
                ...prompt,
                text: promptTemplate
            });
        }
    }
}