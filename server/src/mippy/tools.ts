import { ChatCompletionTool } from "openai/resources/index.mjs";
import { FunctionParameters } from "openai/resources/shared.mjs";

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
    }
}

export const toolsSchema: ChatCompletionTool[] = [
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