import { green } from 'kolorist';
import OpenAI from 'openai';
import { ChatCompletionMessageToolCall, CompletionUsage } from 'openai/resources/index.mjs';
import { BehaviorSubject, catchError, combineLatest, concatMap, debounceTime, defer, EMPTY, exhaustMap, filter, first, from, map, mergeMap, Observable, share, Subject, switchMap, throttleTime, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { observeDay } from "shared/rx/observables/date";
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

function appendDelta(value: OpenAI.Chat.Completions.ChatCompletionChunk, partial: MippyPartialResult) {
    if (value.choices[0].finish_reason) {
        partial.finished = true;
    }
    const delta = value.choices[0].delta;
    partial.text += delta.content ?? "";
    if (delta.tool_calls) {
        partial.tool_calls = partial.tool_calls ?? [];
        for (let call of delta.tool_calls) {
            let current = partial.tool_calls[call.index];
            if (!current) {
                current = {
                    id: "",
                    type: "function",
                    function: {
                        name: "",
                        arguments: "",
                    }
                };
                partial.tool_calls[call.index] = current;
            }
            current.id += call.id ?? "";
            current.function.arguments += call.function?.arguments ?? "";
            current.function.name += call.function?.name ?? "";
        }
    }
    if (value.usage) {
        partial.usage = {
            ...partial.usage,
            ...value.usage,
        };
    }
}

const logError = <In>() => catchError<In, typeof EMPTY>(e => { log.error(e); return EMPTY; });

type MippyResult = {
    partial: Observable<MippyPartialResult>,
    complete: Observable<MippyMessage>
}

export type MippyPartialResult = {
    text: string,
    tool_calls?: Array<ChatCompletionMessageToolCall>//,Array<ChatCompletionChunk.Choice.Delta.ToolCall>,
    usage?: CompletionUsage,
    finished: boolean
}

export class ChatGPTMippyBrain implements MippyBrain {
    prompt$ = new Subject<Prompt>();
    messages$: Observable<MippyResult>;
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
        const systemPrompt$ = combineLatest([userPrompt$, personality$, toolPrompt$, observeDay()]).pipe(
            map(([users, personality, tools, date]) => {
                let result = config.systemPrompt.prompt.replaceAll("[personality]", personality);
                result = result.replaceAll("[users]", users);
                result = result.replaceAll("[tools]", tools);
                result = result.replaceAll("[date]", date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
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

        this.messages$ = this.prompt$.pipe(
            withLatestFrom(system$, history$),
            concatMap(([prompt, system, history]) => {
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

                const response$ = defer(() => from(client.chat.completions.create({
                    messages: [
                        system.message,
                        ...history.summaries,
                        ...history.messages,
                        ...(store ? [] : [userMessage])
                    ],
                    model: "gpt-4o-mini",
                    tool_choice: allowTools ? "auto" : undefined,
                    tools: allowTools ? system.toolsSchema : undefined,
                    stream: true
                })).pipe(
                    switchMap(obs => obs),
                    share()
                ));

                const temp$ = store ? from(history.addMessage(userMessage, summarise)).pipe(switchMap(() => response$)) : response$;

                return new Observable<MippyResult>(subscriber => {
                    const partial: MippyPartialResult = {
                        text: "",
                        tool_calls: undefined,
                        usage: undefined,
                        finished: false
                    }

                    const partial$ = new Subject<MippyPartialResult>();
                    const complete$ = new Subject<MippyMessage>();

                    subscriber.next({
                        complete: complete$.pipe(first()),
                        partial: partial$.pipe(share())
                    })

                    const responseSubscription = temp$.subscribe({
                        next: value => {
                            appendDelta(value, partial);
                            partial$.next(partial);
                        },
                        complete: () => {
                            log.info(`Response (${green(chatGptTimer.end())} - ${green(partial.usage?.total_tokens.toString() ?? "")} tokens): ${green(partial.text)}`);
                            complete$.next({
                                text: partial.text,
                                tool: partial.tool_calls,
                                prompt: prompt,
                            })
                            subscriber.complete();
                            partial$.complete();
                        }
                    })

                    return complete$.pipe(
                        switchMap(async message => {
                            await history.addMessage(history.create("assistant", message.text ?? ""), summarise);
                            return message;
                        })
                    ).subscribe({
                        complete: () => {
                            responseSubscription.unsubscribe();
                        }
                    })
                })
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

    observeCompleteMessages() {
        return this.messages$.pipe(
            switchMap(result => result.complete)
        );
    }

    receive(): Observable<MippyMessage> {
        return this.observeCompleteMessages().pipe(
            filter(result => !!result.text)
        );
    }

    receivePartials(): Observable<Observable<MippyPartialResult>> {
        return this.messages$.pipe(
            map(result => result.partial)
        );
    }

    receiveToolCalls() {
        return this.observeCompleteMessages().pipe(
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
