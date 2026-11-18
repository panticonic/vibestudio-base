/** The name compiled eval code calls; a realm that binds it runs instrumented code. */
export declare const MEMORY_CHECK = "__natlang_memory";
/**
 * Default bound in MB. Data (2026-11-16, 20,582 `invocation_end` records of shared collector processes serving up to
 * 8 RL/teacher episodes each): the whole process heap had a median of 147 MB and p99 323 MB, i.e. episodes need tens of
 * MB. 256 MB is an order of magnitude above a legitimate evaluation, and 8 evaluations at the bound still fit a 4 GB
 * collector heap. Setting: `NATLANG_EVAL_MEMORY_MB` (0 turns the bound off) or the environment's `memoryLimitMb`. The same
 * bound covers callable-folder module code (`segmentGuard`), the folder `python` tool (WASM memory growth per cell,
 * native/folder-python.ts) and the folder `bash` tool (just-bash byte limits and a write budget, native/folder-shell.ts).
 * Browser evals stay unbounded: a page has no synchronous, precise heap reading (`performance.memory` is coarse and
 * Chrome-only, `measureUserAgentSpecificMemory` is asynchronous), and a runaway there ends only the user's own tab.
 */
export declare const DEFAULT_EVAL_MEMORY_MB = 256;
/** How a platform reads its heap: bytes in use, and a full collection (absent: growth is judged without one). */
export type HeapProbe = {
    used(): number;
    collect?(): void;
};
/** The bound in MB: `NATLANG_EVAL_MEMORY_MB` (0 turns it off), else `DEFAULT_EVAL_MEMORY_MB`. One setting for eval, folder
 * Python, folder bash and callable-folder module code. */
export declare function evalMemoryLimitMb(env?: Record<string, string | undefined>): number;
/** The one-sentence teaching error of a run that exceeded its bound: `eval`, `python`, `bash`, callable-folder code. */
export declare function memoryLimitMessage(subject: string, unit: string, limitMb: number): string;
export declare const evalMemoryMessage: (limitMb: number) => string;
export declare const moduleMemoryMessage: (limitMb: number) => string;
/** The guard of one evaluation: call it from the evaluation's code; it throws once the evaluation's growth is over. */
export declare function memoryGuard(limitMb: number, probe: HeapProbe, message?: string): () => void;
/**
 * The guard of code that runs on behalf of many callers at unknown times (callable-folder module functions): each
 * synchronous run (up to the next microtask checkpoint) is one bounded run with its own base. Growth spread over
 * several runs (across awaits) is not summed.
 */
export declare function segmentGuard(limitMb: number, probe: HeapProbe, message?: string): () => void;
/**
 * `source` with a guard call at the top of every loop iteration and of every function body except constructors
 * (their loops are instrumented). Edits are insertions on the lines they belong to, so line numbers do not move.
 * Source that does not parse is returned as it is: compilation reports its errors.
 */
export declare function instrumentMemoryChecks(source: string, check?: string, kind?: 'ts' | 'js'): string;
