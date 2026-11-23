/** The shared ask pipeline for the shell command and the command-line entry point. */
import { Folder } from './scoped-fs.js';
export type AskOptions = {
    lines?: boolean;
    jsonl?: boolean;
    files?: string;
    filter?: boolean;
    jobs?: number;
    returns?: string;
};
export type AskHost = (instruction: string, returns: string, input: unknown) => Promise<unknown>;
export type CallMode = 'whole' | 'line' | 'jsonl';
export type CallHost = (name: string, input: unknown, mode: CallMode) => Promise<unknown>;
export declare function parseAskArgs(args: string[]): {
    instruction: string;
    options: AskOptions;
};
/**
 * The same JSON/line input contract for the CLI and the folder shell. With `text` (a function whose one parameter is a
 * string), whole input that is not a JSON object is that text. `json` prints every result as JSON, strings quoted.
 */
export declare function executeNatlangCall(name: string, stdin: string, mode: CallMode, call: CallHost, options?: {
    text?: boolean;
    json?: boolean;
}): Promise<string>;
/** Apply one instruction to stdin, each line/record, or each matched file, preserving input order. */
export declare function executeNatlangAsk(folder: Folder, instruction: string, stdin: string, options: AskOptions, ask: AskHost): Promise<string>;
