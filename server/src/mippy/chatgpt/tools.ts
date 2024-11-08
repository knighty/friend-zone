import { ChatCompletionTool } from "openai/resources/index.mjs";
import { FunctionParameters } from "openai/resources/shared.mjs";
import { Observable, map } from "rxjs";
import { ObservableMap } from "shared/rx";
import { ToolCall } from "../chat-gpt-brain";
import { ToolPrompt } from "../mippy-brain";

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

type Actions = "analyze subtitles";

export type ToolArguments = {
    createPoll: {
        title: string,
        options: string[],
        duration: number
    },
    createPrediction: {
        title: string,
        options: string[],
        duration: number
    },
    changePersonality: {
        personality: string
    },
    analyzeSubtitles: {},
    suggestWordOfTheHour: {
        word: string
    },
    getScreen: {},
    action: {
        action: Actions
    }
}

const toolsSchema: ChatCompletionTool[] = [
    toolFunction("createPoll", "Creates a poll. Call this when the user asks you to create a poll", {
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
                description: "The duration of the poll in seconds. Default is 180 seconds",
            }
        },
        required: ["title", "options", "duration"]
    }),
    toolFunction("createPrediction", "Creates a prediction. Call this when the user asks you to create a prediction", {
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
                description: "The duration of the prediction in seconds. Default is 180 seconds",
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
    }),
    toolFunction("analyzeSubtitles", "Analyze Subtitles", {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: []
    }),
    toolFunction("suggestWordOfTheHour", "Function to call to change the word of the hour", {
        type: "object",
        additionalProperties: false,
        properties: {
            word: {
                description: "The word to use. Provide an empty string if you're not sure what to set",
                type: "string"
            }
        },
        required: ["word"]
    }),
    toolFunction("action", "Peform an action", {
        type: "object",
        additionalProperties: false,
        properties: {
            action: {
                description: "The action to perform",
                type: "string",
                enum: ["analyze subtitles"]
            }
        },
        required: ["action"]
    }),
    toolFunction("getScreen", "Get an image of what's on screen", {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: []
    })
];

type ToolRoles = ("admin" | "chat" | "moderator")[];

type ChatGPTTool<Arguments> = {
    id: string,
    tool: ChatCompletionTool,
    prompt: string,
    roles: ToolRoles,
    callback: ToolInvokation<Arguments>
}

type ToolInvokation<Arguments> = (tool: ToolCall<Arguments>) => Promise<string | undefined>

export class ChatGPTTools {
    tools = new ObservableMap<string, ChatGPTTool<any>>();
    stream$: Observable<ToolCall<any>>;
    toolResponse: (prompt: ToolPrompt) => void;

    constructor(stream$: Observable<ToolCall<any>>, toolResponse: (prompt: ToolPrompt) => void) {
        this.stream$ = stream$;
        this.toolResponse = toolResponse;
    }

    getSchema(): Observable<ChatCompletionTool[]> {
        return this.tools.values$.pipe(
            map(tools => tools.map(tool => tool.tool))
        );
    }

    getSystemPrompt(): Observable<string> {
        return this.tools.entries$.pipe(
            map(tools =>
                Object.keys(tools)
                    .filter(key => tools[key].prompt == "")
                    .map(key => `## ${key}\n${tools[key].prompt}`)
                    .join("\n\n")
            )
        )
    }

    handle(toolCall: ToolCall<any>): Promise<string | undefined> {
        const tool = this.tools.data.get(toolCall.function.name);
        if (tool) {
            return tool.callback(toolCall);
        }
        return Promise.resolve("");
    }

    observe(obj: {
        unregister: () => void
    }) {
        return new Observable<void>(subscriber => {
            return () => obj.unregister();
        })
    }

    register<Arguments>(id: string, description: string, parameters: FunctionParameters | undefined, prompt: string, roles: ToolRoles, callback: ToolInvokation<Arguments>) {
        this.tools.set(id, {
            id,
            roles,
            prompt,
            tool: {
                function: {
                    name: id,
                    description,
                    parameters,
                    strict: parameters !== undefined
                },
                type: "function"
            },
            callback
        })

        return {
            unregister: () => {
                this.tools.delete(id);
            }
        }
    }
}