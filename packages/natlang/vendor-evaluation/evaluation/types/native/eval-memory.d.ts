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
 * The run-time bound of one synchronous stretch of model-written code (up to its next `await` or the end of a
 * callback). Eval code runs on its host's event loop, which a shared collector process shares with up to 8 episodes:
 * a search that never returns held the loop, so every co-hosted episode got no model reply for the rest of its case
 * budget (sft-v7 held candidate 2026-11-22: one eval's exponential recursion, 8 episodes scored as timeouts after 3600 s;
 * loop stalls of 2-67 min in 2026-11-19..21 collector logs). The same guard calls as the memory bound read a monotonic
 * clock every `CHECK_EVERY` calls; the first call of a stretch starts its clock and a microtask ends it. A stretch over
 * the bound throws the teaching error, and once tripped every later check of that evaluation throws again (code that
 * catches it cannot keep spinning). An `await` ends a stretch, so asynchronous work is bounded only by `timeout_ms` and
 * the case budget; its synchronous parts let other episodes run in between.
 */
export declare const DEFAULT_EVAL_SYNC_SECONDS = 60;
/** The bound in seconds: `NATLANG_EVAL_SYNC_SECONDS` (0 turns it off), else `DEFAULT_EVAL_SYNC_SECONDS`. */
export declare function evalSyncLimitSeconds(env?: Record<string, string | undefined>): number;
/** The one-sentence teaching error of a stretch that ran past the bound. */
export declare function syncLimitMessage(subject: string, limitSeconds: number): string;
/** The run-time guard of one evaluation (`sticky`) or of one synchronous run of module code (not sticky). */
export declare function syncGuard(limitSeconds: number, message: string, sticky?: boolean, now?: () => number): () => void;
/** One guard from the bounds that are on (memory, run time); undefined when none is. */
export declare function combinedGuard(...guards: (false | 0 | undefined | (() => void))[]): (() => void) | undefined;
/**
 * `source` with a guard call at the top of every loop iteration and of every function body except constructors
 * (their loops are instrumented). Edits are insertions on the lines they belong to, so line numbers do not move.
 * Source that does not parse is returned as it is: compilation reports its errors.
 */
export declare function instrumentMemoryChecks(source: string, check?: string, kind?: 'ts' | 'js'): string;
