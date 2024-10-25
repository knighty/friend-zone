import { green } from 'kolorist';
import OpenAI from 'openai';
import { ChatCompletionMessageToolCall, CompletionUsage } from 'openai/resources/index.mjs';
import { BehaviorSubject, catchError, concat, concatMap, debounceTime, EMPTY, exhaustMap, filter, first, from, map, mergeMap, Observable, of, share, startWith, Subject, switchMap, takeWhile, throttleTime, timer, withLatestFrom } from "rxjs";
import { logger } from "shared/logger";
import { filterMap } from 'shared/rx';
import { truncateString } from 'shared/text-utils';
import { executionTimer, objectRandom } from 'shared/utils';
import { isMippyChatGPT, MippyChatGPTConfig } from "../config";
import Users from '../data/users';
import { getSystem$, getSystemPrompt$ } from './chatgpt/system-prompt';
import { ChatGPTTools, ToolArguments } from './chatgpt/tools';
import { MippyHistory } from "./history/history";
import { MippyHistoryRepository } from './history/repository';
import { isUserPrompt, MippyBrain, MippyMessage, MippyPrompts, PartialPrompt, Prompt } from "./mippy-brain";

const log = logger("brain", true);

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

export type Character = {
    personality: string,
    name: string,
    voice: string,
    image: string,
}

type MippyResult = {
    partial: Observable<MippyPartialResult>,
    complete: Observable<MippyMessage>
}

export type MippyPartialResult = {
    text: string,
    tool_calls?: Array<ChatCompletionMessageToolCall>//,Array<ChatCompletionChunk.Choice.Delta.ToolCall>,
    usage?: CompletionUsage,
    finished: boolean,
    character?: Character
}

class ChatGPTResponse {
    partial: MippyPartialResult;
    finishedReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null = null;
    updatePartial$ = new Subject<void>();
    prompt: Prompt;

    constructor(prompt: Prompt, character: Character) {
        this.partial = {
            text: "",
            tool_calls: undefined,
            usage: undefined,
            finished: false,
            character
        };
        this.prompt = prompt;
    }

    appendDelta(value: OpenAI.Chat.Completions.ChatCompletionChunk) {
        if (value.choices[0]) {
            if (value.choices[0].finish_reason) {
                this.partial.finished = true;
                this.finishedReason = value.choices[0].finish_reason;
            }

            const delta = value.choices[0].delta;
            this.partial.text += delta.content ?? "";
            if (delta.tool_calls) {
                this.partial.tool_calls = this.partial.tool_calls ?? [];
                for (let call of delta.tool_calls) {
                    let current = this.partial.tool_calls[call.index];
                    if (!current) {
                        current = {
                            id: "",
                            type: "function",
                            function: {
                                name: "",
                                arguments: "",
                            }
                        };
                        this.partial.tool_calls[call.index] = current;
                    }
                    current.id += call.id ?? "";
                    current.function.arguments += call.function?.arguments ?? "";
                    current.function.name += call.function?.name ?? "";
                }
            }
        }
        if (value.usage) {
            this.partial.usage = value.usage;
        }
        this.updatePartial$.next(undefined);
    }

    observePartial() {
        return this.updatePartial$.pipe(
            startWith(undefined),
            map(() => this.partial),
            takeWhile(partial => !partial.finished, true)
        )
    }

    observeComplete() {
        return this.observePartial().pipe(
            filter(partial => partial.finished),
            first(),
            map(partial => ({
                text: partial.text,
                tool: partial.tool_calls,
                prompt: this.prompt,
            }))
        )
    }
}

export class ChatGPTMippyBrain implements MippyBrain {
    prompt$ = new Subject<Prompt>();
    messages$ = new Subject<ChatGPTResponse>();
    config: MippyChatGPTConfig;
    users: Users;
    personality$ = new Subject<string>();
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

        const personality$ = this.personality$.pipe(
            concatMap(personality => concat(
                of(personality),
                timer(1000 * 60 * 10).pipe(map(() => null))
            )),
            startWith<string | null>(null),
            map(personality => personality ?? config.systemPrompt.personality)
        );

        const character$: Observable<Character> = of({
            name: "Mippy",
            voice: "",
            personality: "",
            image: ""
        })

        const systemPrompt$ = getSystemPrompt$(config, users, tools, personality$, character$);
        const system$ = getSystem$(config, tools, systemPrompt$);

        const history$ = from(messageRepository.getHistory()).pipe(share())
        const summarizer$ = history$.pipe(
            map(history => history.createHistorySummarizer(client))
        );

        this.hookHistoryPersistence(history$);

        this.prompt$.pipe(
            withLatestFrom(system$, history$, summarizer$, character$),
            concatMap(async ([prompt, system, history, summarizer, character]) => {
                // Init
                const chatGptTimer = executionTimer();
                const store = prompt.store === undefined ? true : prompt.store;
                const promptMessage = isUserPrompt(prompt) ?
                    history.create("user", prompt.text, prompt.name, prompt.image) :
                    history.create("system", prompt.text);
                const allowTools = canUseTools(prompt);

                // Logging
                log.info(`Prompt: ${green(truncateString(prompt.text, 200, true, true))}`);
                log.info(`History: ${green(history.messages.length)} messages. Tools: ${allowTools ? system.toolsSchema.map(tool => green(tool.function.name)).join(", ") : green("not allowed")}`);

                const summaryMessage = history.create("system", `# Summaries
                    ${history.summaries.map(summary => summary.content).join("\n")}`)

                // Prompt ChatGPT and get a response stream
                const stream = await client.chat.completions.create({
                    messages: [
                        system.message,
                        summaryMessage,
                        ...history.messages,
                        promptMessage
                    ],
                    model: "gpt-4o-mini",
                    tool_choice: allowTools ? "auto" : undefined,
                    tools: allowTools ? system.toolsSchema : undefined,
                    stream: true,
                    stream_options: {
                        include_usage: true
                    }
                });

                // Create a response object and pass to the messages$ subject to be consumed
                const response = new ChatGPTResponse(prompt, character);
                this.messages$.next(response);
                for await (let item of stream) {
                    response.appendDelta(item);
                }

                // Complete - log
                const timeTaken = chatGptTimer.end();
                const tokens = response.partial.usage?.total_tokens.toString() ?? "";
                const text = truncateString(response.partial.text, 200, true, true);
                let toolsUsed: string[] = [];
                if (response.partial.tool_calls && response.partial.tool_calls.length > 0) {
                    toolsUsed = response.partial.tool_calls.map(tool => tool.function.name);
                }
                const toolsUsedLog = toolsUsed.length > 0 ? ` Tools: ${toolsUsed.map(green).join(", ")} ` : "";
                log.info(`Response (${green(response.finishedReason ?? "")}) (${green(timeTaken)} - ${green(tokens)} tokens)${toolsUsedLog}: ${green(text)}`);

                // Store response, summarising if necessary
                if (store) {
                    await history.addMessage(history.create("user", prompt.text), null);
                    await history.addMessage(history.create("assistant", response.partial.text ?? ""), summarizer);
                }
            }),
            catchError(e => {
                log.error(e);
                return EMPTY;
            }),
            share(),
        ).subscribe();
    }

    setPersonality(personality: string) {
        this.personality$.next(personality);
    }

    setRandomPersonality() {
        const personality = objectRandom(this.config.systemPrompt.personalities);
        if (personality) {
            this.personality$.next(personality.prompt);
        }
    }

    observeCompleteMessages() {
        return this.messages$.pipe(
            concatMap(result => result.observeComplete())
        );
    }

    receive(): Observable<MippyMessage> {
        return this.observeCompleteMessages().pipe(
            filter(result => !!result.text)
        );
    }

    receivePartials(): Observable<Observable<MippyPartialResult>> {
        return this.messages$.pipe(
            map(result => result.observePartial())
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
