import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool, FunctionParameters } from 'openai/resources/index.mjs';
import { BehaviorSubject, catchError, combineLatest, concatMap, defer, EMPTY, filter, from, map, mergeMap, Observable, share, Subject, switchMap, tap, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { isMippyChatGPT, MippyChatGPTConfig } from "../config";
import Users from '../data/users';
import { MippyBrain, MippyMessage, MippyPrompts, Prompt } from "./mippy-brain";

const log = logger("mippy-chat-gpt-brain", true);

export type ToolCall<Args = any> = {
    id: string,
    function: { name: string, arguments: Args },
    source: string
}

function toolFunction<Parameters extends FunctionParameters>(title: string, description: string, parameters: Parameters): ChatCompletionTool {
    return {
        function: {
            name: title,
            description: description,
            parameters: parameters,
            strict: true
        },
        type: "function"
    };
}

const toolsSchema: ChatCompletionTool[] = [
    toolFunction("createPoll", "Creates a poll", {
        type: "object",
        additionalProperties: false,
        properties: {
            title: {
                description: "The title of the poll",
                type: "string"
            },
            options: {
                type: "array",
                description: "The list of options for the poll",
                items: {
                    type: "string"
                }
            },
            duration: {
                type: "number",
                description: "The duration of the poll in seconds",
            }
        },
        required: ["title", "options", "duration"]
    }),
    toolFunction("createPrediction", "Creates a prediction", {
        type: "object",
        additionalProperties: false,
        properties: {
            title: {
                description: "The title of the prediction",
                type: "string"
            },
            options: {
                type: "array",
                description: "The list of options for the prediction",
                items: {
                    type: "string"
                }
            },
            duration: {
                type: "number",
                description: "The duration of the poll in seconds",
            }
        },
        required: ["title", "options", "duration"]
    }),
    toolFunction("changePersonality", "Changes Mippy's personality", {
        type: "object",
        additionalProperties: false,
        properties: {
            personality: {
                description: "The new personality prompt",
                type: "string"
            }
        },
        required: ["personality"]
    })
];

function message(role: "system" | "user" | "assistant", content: string) {
    return { role, content }
}

const logError = <In>() => catchError<In, typeof EMPTY>(e => { log.error(e); return EMPTY; });

export class ChatGPTMippyBrain implements MippyBrain {
    prompt$ = new Subject<Prompt>();
    messages$: Observable<MippyMessage>;
    config: MippyChatGPTConfig;
    users: Users;
    chatSummaries: ChatCompletionMessageParam[] = [];
    chatHistory: ChatCompletionMessageParam[] = [];
    personality$ = new BehaviorSubject<string>(null);
    tools$ = new BehaviorSubject<Record<string, string>>({});

    constructor(apiKey: string, config: MippyChatGPTConfig, users: Users) {
        this.config = config;
        this.users = users;

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
                message: message("system", systemPrompt),
                toolsSchema: toolsSchema
            }))
        )

        this.messages$ = this.prompt$.pipe(
            withLatestFrom(system$),
            concatMap(([prompt, system]) => {
                log.info(`Prompt: ${prompt.text}`);
                log.info(`History: ${this.chatHistory.length} messages. Tools: ${system.toolsSchema.map(tool => tool.function.name).join(", ")}`);

                // Handle summarising
                let summariseObservable$: Observable<any> = null;
                if (this.chatHistory.length > 100) {
                    summariseObservable$ = defer(() => {
                        const summariseMessages = this.chatHistory.slice(0, 50);
                        log.info(`Summarising ${summariseMessages.length} messages`);
                        const params: OpenAI.Chat.ChatCompletionCreateParams = {
                            messages: [
                                system.message,
                                ...summariseMessages,
                                message("user", "Summarise the important parts of the chat up until now")
                            ],
                            model: "gpt-4o-mini",
                        };
                        return from(client.chat.completions.create(params)).pipe(
                            logError(),
                            map(result => result.choices[0].message.content),
                            tap(text => {
                                this.chatHistory = this.chatHistory.slice(50);
                                this.chatSummaries.push(message("assistant", text));
                                log.info(`Summarised history: ${text}`);
                            })
                        );
                    })
                }

                // Handle the new message
                const obs$ = defer(() => {
                    this.chatHistory.push(message("user", prompt.text));
                    const params: OpenAI.Chat.ChatCompletionCreateParams = {
                        messages: [
                            system.message,
                            ...this.chatSummaries,
                            ...this.chatHistory,
                        ],
                        model: "gpt-4o-mini",
                        tool_choice: "auto",
                        tools: system.toolsSchema
                    };
                    return from(client.chat.completions.create(params)).pipe(
                        logError(),
                        map(result => ({
                            text: result.choices[0].message.content,
                            tool: result.choices[0].message.tool_calls,
                            prompt: prompt.text,
                            source: prompt.source
                        })),
                        tap(result => {
                            this.chatHistory.push(message("assistant", result.text ?? ""));
                            log.info(`Result: ${result.text}`)
                        })
                    );
                })

                return summariseObservable$ ? summariseObservable$.pipe(switchMap(() => obs$)) : obs$
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
        return this.messages$;
    }

    receiveToolCalls() {
        return this.messages$.pipe(
            filter(message => !!message.tool),
            mergeMap(message => {
                const tools: ToolCall[] = [];
                for (let tool of message.tool) {
                    try {
                        const args = JSON.parse(tool.function.arguments);
                        tools.push({
                            id: tool.id,
                            function: {
                                name: tool.function.name,
                                arguments: args,
                            },
                            source: message.source

                        });
                    } catch (e) {
                        log.error("Error parsing arguments");
                    }
                }
                return from(tools);
            })
        )
    }

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, source?: string) {
        if (isMippyChatGPT(this.config)) {
            let prompt = this.config.prompts[event];
            if (!prompt)
                return;

            for (let key in data) {
                prompt = prompt.replace(`[${key}]`, data[key].toString());
            }

            this.prompt$.next({
                text: prompt,
                source
            });
        }
    }
}