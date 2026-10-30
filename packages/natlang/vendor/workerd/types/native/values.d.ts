import { TypeEnv } from './types.js';
import type { Type } from './types.js';
import { FileHandle, Folder, FolderHandle, type FolderTransaction } from './scoped-fs.js';
export declare const MISSING: unique symbol;
export type Missing = typeof MISSING;
/** A live host object (Date, Map, class instance, function, ...) carried by identity. */
export interface LiveObject {
    readonly __natlangLive?: never;
}
export type Value = null | boolean | number | string | Value[] | {
    [key: string]: Value;
} | Pending | Missing | Folder | FolderHandle | FileHandle | LiveObject;
export type Status = 'unreduced' | 'running' | 'quiesced' | 'waiting' | 'done';
/** Live captured binding of an inline lambda: read at each eval, written back when an eval succeeds. */
export type CaptureCell = {
    name: string;
    type: string;
    mutable: boolean;
    get(): unknown;
    set?(value: unknown): void;
    /** The bound skill that injected this binding (S2 scope injection), when one did. */
    skill?: string;
};
/** One natural-language function invocation: its typed scope, instructions, and progress. */
export type LambdaNode = {
    nodeKind: 'lambda';
    type: Type;
    types: Record<string, Type>;
    typesSrc: Record<string, string>;
    status: Status;
    note: string;
    attempts: number;
    steps: number;
    body: string;
    originalBody?: string;
    args: Record<string, Value>;
    return: Value;
    let: Record<string, Value>;
    letTypes: Record<string, Type>;
    /** Callable context: the record tree of the function's callable folder (see runtime/loader.ts). */
    codebase: Record<string, unknown>;
    functionName: string;
    subtype: 'function' | 'directory-reducer';
    projectTransaction?: FolderTransaction;
    /** Set when a compiled case stopped and the agent takes over: what the case already did (calls/dispatch.ts). */
    handoff?: string;
    extraTransactions?: FolderTransaction[];
    reducerMode: '' | 'apply' | 'direct';
    captures?: Record<string, CaptureCell>;
    /**
     * Skills bound in this call's context (S2 progressive disclosure): the opening's listing, and every readable
     * document by its `read_code` target (`skills.<name>`, `skills.<name>/<path>`).
     */
    skills?: {
        listing: string;
        documents: Record<string, string>;
        declarations: string;
        /** Exact bound project skill files; propagated only to inline children of this invocation. */
        files?: Record<string, string | Uint8Array>;
        inventory?: {
            name: string;
            revision: string;
        }[];
    };
    /** Constructors for class-typed host contracts. */
    hostClasses?: ReadonlyMap<string, Function>;
    /** `decision`: answer by scoring the finite result values in one pass (native/decision.ts). `template`: the first
     * turn's reply is forced to `return_result` with the value written as a block (a Neuralese result) or decoded. */
    readout?: 'decision' | 'template';
};
export type Pending = LambdaNode;
/** `text`, when set, is the whole model-facing line (a sentence without the `path: code` prefix); `code` stays for traces. */
export type Diagnostic = {
    path: string;
    code: string;
    expected?: string;
    got?: string;
    text?: string;
};
export declare class Reject extends Error {
    readonly diagnostics: Diagnostic[];
    constructor(diagnostics: Diagnostic[]);
}
export declare const isPlainRecord: (value: unknown) => value is Record<string, unknown>;
export declare const isPending: (value: unknown) => value is Pending;
/** A value that is carried by identity: anything other than portable data, pending nodes, and folder/tree handles. */
export declare const isLive: (value: unknown) => value is LiveObject;
/** Stable per-process identity for a live value, used in traces and previews. */
export declare function liveId(value: object): number;
/** Presentation identities belong to an execution, not the hosting process.
 * Keep process identities above for trace serialization; fresh replay should
 * show the same labels without losing aliases between objects in one run.
 */
export declare function createLiveIdentity(): (value: object) => number;
export declare function scopedLiveIdentity(scope: object): (value: object) => number;
export declare function liveLabel(value: object): string;
/** Rebuild plain data in this realm (eval values come from the sandbox realm); live values keep identity. */
export declare function hostCopy(value: unknown, seen?: Map<object, unknown>): unknown;
export type CoerceOptions = {
    preserveRecordExtras?: boolean;
};
export declare function coerce(raw: unknown, type: Type, env: TypeEnv, path?: string, options?: CoerceOptions): Value;
export declare function buildPending(raw: unknown, env?: TypeEnv, path?: string): Pending;
export declare function loadProgram(raw: unknown): Pending;
export declare function problems(value: Value, type: Type, env: TypeEnv, path: string): {
    holes: Diagnostic[];
};
export declare function unboundParts(node: Pending, env: TypeEnv, path: string): Diagnostic[];
export declare function dump(value: Value, full?: boolean): unknown;
export declare function dumpState(value: Value): unknown;
