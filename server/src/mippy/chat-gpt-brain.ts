import { green } from 'kolorist';
import OpenAI from 'openai';
import { ChatCompletionMessageToolCall, CompletionUsage } from 'openai/resources/index.mjs';
import { BehaviorSubject, catchError, concatMap, debounceTime, defer, EMPTY, exhaustMap, filter, first, from, map, mergeMap, Observable, share, Subject, switchMap, throttleTime, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { filterMap } from 'shared/rx';
import { truncateString } from 'shared/text-utils';
import { executionTimer } from 'shared/utils';
import { isMippyChatGPT, MippyChatGPTConfig } from "../config";
import Users from '../data/users';
import { getSystem$, getSystemPrompt$ } from './chatgpt/system-prompt';
import { ChatGPTTools, ToolArguments } from './chatgpt/tools';
import { MippyHistory } from "./history/history";
import { MippyHistoryRepository } from './history/repository';
import { isUserPrompt, MippyBrain, MippyMessage, MippyPrompts, PartialPrompt, Prompt } from "./mippy-brain";

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
    if (value.choices[0]) {
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
    }
    if (value.usage) {
        partial.usage = value.usage;
    }
}

function canUseTools(prompt: Prompt) {
    return prompt.allowTools && prompt.source == "admin"
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
    messageRepository: MippyHistoryRepository;

    private hookHistoryPersistence(history$: Observable<MippyHistory>) {
        history$.pipe(
            switchMap(history => history.updated$),
            debounceTime(5000),
            throttleTime(60000, undefined, { leading: true, trailing: true }),
            exhaustMap(history => this.messageRepository.persistHistory(history))
        ).subscribe()
    }

    constructor(client: OpenAI, config: MippyChatGPTConfig, users: Users, messageRepository: MippyHistoryRepository, tools: ChatGPTTools) {
        this.config = config;
        this.users = users;
        this.messageRepository = messageRepository;

        const systemPrompt$ = getSystemPrompt$(config, users, tools);
        const system$ = getSystem$(config, tools, systemPrompt$);

        const history$ = from(messageRepository.getHistory()).pipe(share())
        const summarizer$ = history$.pipe(
            map(history => history.createHistorySummarizer(client))
        );

        this.hookHistoryPersistence(history$);

        this.messages$ = this.prompt$.pipe(
            withLatestFrom(system$, history$, summarizer$),
            concatMap(([prompt, system, history, summarizer]) => {
                const chatGptTimer = executionTimer();
                const store = prompt.store === undefined ? true : prompt.store;
                const promptMessage = isUserPrompt(prompt) ?
                    history.create("user", prompt.text, prompt.name, prompt.image) :
                    history.create("system", prompt.text);
                const allowTools = canUseTools(prompt);

                log.info(`Prompt: ${green(prompt.text)}`);
                log.info(`History: ${green(history.messages.length)} messages. Tools: ${allowTools ? system.toolsSchema.map(tool => green(tool.function.name)).join(", ") : green("not allowed")}`);

                const response$ = defer(() => from(client.chat.completions.create({
                    messages: [
                        system.message,
                        ...history.summaries,
                        ...history.messages,
                        ...(store ? [] : [promptMessage])
                    ],
                    model: "gpt-4o-mini",
                    tool_choice: allowTools ? "auto" : undefined,
                    tools: allowTools ? system.toolsSchema : undefined,
                    stream: true,
                    stream_options: {
                        include_usage: true
                    }
                })).pipe(
                    switchMap(obs => obs),
                    share()
                ));

                const temp$ = store ? from(history.addMessage(promptMessage, summarizer)).pipe(switchMap(() => response$)) : response$;

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
                            const timeTaken = chatGptTimer.end();
                            const tokens = partial.usage?.total_tokens.toString() ?? "";
                            const text = truncateString(partial.text, 200, true, true);
                            log.info(`Response (${green(timeTaken)} - ${green(tokens)} tokens): ${green(text)}`);
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
                            if (store)
                                await history.addMessage(history.create("assistant", message.text ?? ""), summarizer);
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
            }),
            share()
        )
    }

    observeToolMessage<T extends keyof ToolArguments>(toolName: T, permission: string = "admin") {
        const toolCall$ = this.receiveToolCalls();
        const checkPermission = (source?: string) => {
            if (permission == "admin") {
                return source == permission;
            }
            return true;
        }
        return toolCall$.pipe(
            filter(tool => tool.function.name == toolName && checkPermission(tool.prompt.source))
        );
    }

    observeTool<T extends keyof ToolArguments>(toolName: T, permission: string = "admin"): Observable<ToolArguments[T]> {
        const toolCall$ = this.receiveToolCalls();
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

    ask<Event extends keyof MippyPrompts, Data extends MippyPrompts[Event]>(event: Event, data: Data, prompt: PartialPrompt) {
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
