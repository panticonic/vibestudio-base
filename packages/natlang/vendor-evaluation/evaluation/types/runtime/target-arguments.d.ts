import { TypeEnv, type Type } from '../native/types.js';
import { type ExpandedType } from '../native/expand-type.js';
export type TargetArgument = {
    name: string;
    type: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    path?: 'file' | 'folder';
};
/** An argument as the dashboard's form needs it: its type expanded for an editor (`expandType`). */
export type ArgumentDescription = TargetArgument & {
    required: boolean;
    text: string;
    tree: ExpandedType;
    /** How the command line spells it: `text` as written, `json` as JSON. */
    spelling: 'text' | 'json';
    problem?: string;
};
export type ArgumentProblem = {
    argument: string;
    path: string;
    message: string;
};
/** Structural checks of a manifest's `arguments` array; types are parsed, names resolve later against `types.ts`. */
export declare function parseTargetArguments(value: unknown, target: string): TargetArgument[];
/** The program's type environment: the aliases of its `types.ts`, with their field doc comments. */
export declare function programTypes(root: string): {
    env: TypeEnv;
    docs: Record<string, Record<string, string>>;
};
/** Whether values of `type` are strings only, so the command line writes them as they are. */
export declare function spelling(type: Type, env: TypeEnv): 'text' | 'json';
/** The arguments of a target as the dashboard's form needs them. A type that does not resolve carries its `problem`. */
export declare function describeArguments(declared: TargetArgument[] | undefined, root: string): ArgumentDescription[];
/** `input: string, count?: number = 3`, the target's signature for usage lines and form headings. */
export declare function argumentSignature(declared: TargetArgument[]): string;
/** `<input: string> [count: number]`: the command-line usage of the arguments, required ones in angle brackets. Each can
 * also be given by name (`--count 3`). */
export declare function argumentUsage(declared: TargetArgument[]): string;
/**
 * Read command-line `raw` values into checked values by name. An empty or absent optional argument takes its default
 * or is left out (the dashboard writes an empty word for an argument it skips before a later one); `problems` lists
 * every argument that is missing, malformed or the wrong type.
 */
export declare function readTargetArguments(declared: TargetArgument[] | undefined, raw: string[], root: string, workspace: string): {
    values: Record<string, unknown>;
    problems: ArgumentProblem[];
};
/** Problems of `value` as a `type`: the runtime's own check, plus record fields that are required and absent. */
export declare function checkValue(value: unknown, type: Type, env: TypeEnv, path: string): ArgumentProblem[];
