import { type FolderTransaction } from '../native/scoped-fs.js';
import { type DialectBinding } from '../native/types.js';
import { type GenericResult, type Representation } from '../native/representation.js';
import { type RefinementCode } from '../native/refinement.js';
import { type CaptureCell, type LambdaNode, type Value } from '../native/values.js';
import { type Frame } from './context.js';
import { type TierAttempt } from '../calls/tiers.js';
export type { CaptureCell };
/** A natlang function definition as the kernel runs it. */
export type CallableDefinition = {
    programId?: string;
    id: string;
    name: string;
    body: string;
    params: {
        name: string;
        type: string;
        optional?: boolean;
    }[];
    /** Takes whatever each call passes (an inline function saved without parameters; see InlineLambdaPlan). */
    openParameters?: boolean;
    /** Compiler-authenticated fixed signature; JS callback extras are not inputs. */
    declaredParameters?: true;
    returns: string;
    types: Record<string, string>;
    /** Callable context: the record tree this definition (and its inline descendants) may call. */
    codebase: Record<string, unknown>;
    subtype: 'function' | 'directory-reducer';
    /** `decision`: the call scores its finite result values instead of running the tool loop (native/decision.ts).
     * `template`: the call's first reply is forced to `return_result`, its value written or decoded (template readout). */
    readout?: 'decision' | 'template';
    /** The runtime's model this definition runs on (`models`); the default model when absent or not configured. */
    model?: string;
    /** Tools this definition's own calls are not offered (`withhold:` frontmatter; loader WITHHOLDABLE_TOOLS). */
    withhold?: readonly string[];
    revision?: string;
    description?: string;
    /** Source path for named definitions. */
    source?: string;
    /** ID of the context the definition is bound to, when it was rebound (`fn.in(context)`) or defined in one. */
    contextId?: string;
    /** A representation-generic result (`returns` is then its crisp instance until a call instantiates it). */
    generic?: GenericResult;
    /** The instance this definition runs, once a call has instantiated its generic result (`instantiateDefinition`). */
    representation?: Representation;
};
/** The representation a call asks for: from the compiler's annotation of its call site, or a host's `invokeAt`. */
export type Instantiation = {
    representation: Representation; /** The call site, for messages. */
    site?: string;
};
export type InvokeOptions = {
    captures?: Record<string, CaptureCell>;
    /** Instructions after interpolation, for inline lambdas. */
    instructions?: string;
    folder?: {
        transaction: FolderTransaction;
        mode: 'apply' | 'direct';
    };
    /** Constructors for class-typed parameters and returns. */
    classes?: ReadonlyMap<string, Function>;
    /** The runtime's dialect binding for checking arguments and results (the kernel sets it from its Neuralese options). */
    dialects?: DialectBinding;
    manifest?: Record<string, unknown>;
    /** Files of the context's `skills/` data entries, by path (`skills/<name>/SKILL.md`, ...): the call's bound skills. */
    skillFiles?: Readonly<Record<string, string | Uint8Array>>;
    /** Set by the tiered engine (calls/tiers.ts): this call is one attempt at one tier. */
    tierAttempt?: TierAttempt;
    /** The representation this call runs the definition's result at (a generic result's crisp instance by default). */
    at?: Instantiation;
};
/**
 * The definition a call runs at a representation (DECISIONS.md 2026-10-09). A generic result's crisp instance runs as
 * written; its Neuralese instance returns the soft form, written by template readout (DECISIONS.md 44), and needs a
 * runtime with a reader dialect. A definition without a generic result runs only at the representation it declares.
 */
export declare function instantiateDefinition(frame: Frame, definition: CallableDefinition, at: Instantiation): CallableDefinition;
export declare class NatlangCallError extends Error {
    readonly definition: string;
    readonly outcome: string;
    readonly detail: string;
    readonly callId: string;
    readonly trace: Record<string, unknown>[];
    constructor(definition: string, outcome: string, detail: string, callId: string, trace: Record<string, unknown>[]);
}
/** A call that ended because its result did not satisfy a refined type (`Is<T, P>`): the code is the one in `detail`. */
export declare class RefinementCallError extends NatlangCallError {
    readonly code: Exclude<RefinementCode, 'refinement-predicate-invalid'>;
    constructor(code: Exclude<RefinementCode, 'refinement-predicate-invalid'>, definition: string, outcome: string, detail: string, callId: string, trace: Record<string, unknown>[]);
}
/** Convert an interpreter value into an ordinary JavaScript value for host code. */
export declare function toHost(value: Value): unknown;
/** The pending lambda node for one invocation of `definition` with positional inputs (not yet run). */
export declare function definitionNode(definition: CallableDefinition, inputs: unknown[], options?: InvokeOptions): LambdaNode;
/** Prepare the same context-bound node for public calls and direct host execution. */
export declare function prepareDefinitionNode(definition: CallableDefinition, inputs: unknown[], options?: InvokeOptions): Promise<LambdaNode>;
/**
 * Run one natlang definition in the given frame and return its checked value. Model code can start a call and never
 * await it (an eval that fails first, a promise left in a variable): its failure is then no one's to handle, and it must
 * not end the host process as an unhandled rejection. Whoever awaits the call still gets the failure.
 */
export declare function invokeDefinition(frame: Frame, definition: CallableDefinition, positional: unknown[], options?: InvokeOptions): Promise<unknown>;
