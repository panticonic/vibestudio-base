import type { ModelTurn, ModelTurnDelta, ModelTurnRequest } from '../contracts.js';
export type PiJsonValue = null | boolean | number | string | readonly PiJsonValue[] | {
    [key: string]: PiJsonValue;
};
export type PiJsonObject = {
    [key: string]: PiJsonValue;
};
export type PiTextBlock = {
    type: 'text';
    text: string;
};
export type PiThinkingBlock = {
    type: 'thinking';
    thinking: string;
};
export type PiToolCallBlock = {
    type: 'toolCall';
    id: string;
    name: string;
    arguments: PiJsonObject;
    thoughtSignature?: string;
};
export type PiContentBlock = PiTextBlock | PiThinkingBlock | PiToolCallBlock;
/** Token usage in Pi's shape; natlang reads `input` and `output` and passes the whole value through to the trace. */
export type PiUsage = {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
    };
};
export type PiMessage = {
    role: 'system';
    content: string;
    timestamp: number;
} | {
    role: 'user';
    content: string;
    timestamp: number;
} | {
    role: 'assistant';
    content: PiContentBlock[];
    api: string;
    provider: string;
    model: string;
    usage: PiUsage;
    stopReason: 'stop' | 'toolUse';
    timestamp: number;
} | {
    role: 'toolResult';
    toolCallId: string;
    toolName: string;
    content: PiTextBlock[];
    isError: false;
    timestamp: number;
};
export type PiTool = {
    name: string;
    description: string;
    parameters: object;
};
export type PiContext = {
    messages: PiMessage[];
    tools: PiTool[];
};
/** What natlang reads of a completed Pi assistant message (pi-ai's `AssistantMessage` is assignable to it). */
export type PiAssistantMessage = {
    content: readonly (PiContentBlock | {
        type: string;
    })[];
    stopReason: string;
    usage: {
        input: number;
        output: number;
    };
    errorMessage?: string;
};
/** The Pi stream events natlang reads (a subset of pi-ai's `AssistantMessageEvent`; other events are ignored). */
export type PiStreamEvent = {
    type: string;
    contentIndex?: number;
    delta?: string;
    partial?: {
        content: readonly (PiContentBlock | {
            type: string;
        })[];
    };
};
export declare const emptyPiUsage: PiUsage;
/**
 * A request's messages and tools as a Pi context for `model` (its API decides how history is carried: the Google APIs
 * take host-generated calls as user notes, since they do not accept calls the model never made).
 */
export declare function toPiContext(request: ModelTurnRequest, model: {
    api: string;
    provider: string;
    id: string;
}): PiContext;
/**
 * The Pi stream option that makes the reply a tool call (`tool_choice: 'required'`), or none: Pi's neutral
 * `toolChoice` knows only auto and none, so each API takes its own word for "must call a tool" (`any` or `required`).
 */
export declare function piToolChoiceOptions(api: string, request: Pick<ModelTurnRequest, 'tool_choice'>): {
    toolChoice?: 'any' | 'required';
};
/**
 * Translate a turn's Pi stream events into `ModelTurnDelta`s (contracts.ts): text, reasoning (a later thinking part
 * after a newline, as the turn joins them), and each tool call by its order among the calls. Stateful: use one
 * translator per turn. Returns undefined for events that carry nothing to show.
 */
export declare function piDeltaTranslator(): (event: PiStreamEvent) => ModelTurnDelta | undefined;
/** The parts of a completed Pi assistant message: its tool calls (with the OpenAI-shaped `raw_calls`), text and reasoning. */
export declare function piAssistantContent(reply: PiAssistantMessage): {
    calls: PiToolCallBlock[];
    text: string;
    reasoning: string;
    rawCalls: {
        thought_signature?: string | undefined;
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
    }[];
};
/**
 * A completed Pi assistant message as the model turn natlang's interpreter reads. A reply that ended in `error` or
 * `aborted` is a failed turn: it throws, carrying Pi's message (`provider` names the backend in the fallback text).
 * `raw_response` holds Pi's stop reason and usage; a backend adds its own observations to it.
 */
export declare function piAssistantToTurn(reply: PiAssistantMessage, provider: string): ModelTurn;
