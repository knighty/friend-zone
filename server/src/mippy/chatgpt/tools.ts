import { ChatCompletionTool } from "openai/resources/index.mjs";
import { FunctionParameters } from "openai/resources/shared.mjs";
import { Observable, map } from "rxjs";
import { ObservableMap } from "shared/rx";
import { MippyChatGPTConfig } from "../../config";

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
    analyzeStream: {},
    action: {
        action: Actions
    }
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
    }),
    toolFunction("analyzeSubtitles", "Analyze Subtitles", {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: []
    }),
    toolFunction("suggestWordOfTheHour", "Suggest word of the hour", {
        type: "object",
        additionalProperties: false,
        properties: {
            word: {
                description: "The word to use. Supply an empty string if you're not sure what to set",
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
    })
];

export class ChatGPTTools {
    tools = new ObservableMap<string, string>();

    constructor(config: MippyChatGPTConfig) {
        this.tools.setBatch(config.systemPrompt.tools);
    }

    getSchema(): Observable<ChatCompletionTool[]> {
        return this.tools.entries$.pipe(
            map(tools => toolsSchema.filter(tool => !!tools[tool.function.name])),
        )
    }

    getSystemPrompt(): Observable<string> {
        return this.tools.entries$.pipe(
            map(tools => Object.keys(tools).map(key => `## ${key}\n${tools[key]}`).join("\n\n"))
        )
    }
}