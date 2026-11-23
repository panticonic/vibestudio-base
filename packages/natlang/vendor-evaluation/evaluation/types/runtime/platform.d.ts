/**
 * What a natlang runtime runs on. A platform is a plain value passed to `createNatlangRuntime({ platform })`; nothing is
 * registered process-wide, so runtimes on different platforms coexist in one realm and one runtime's evaluator,
 * modules and call store never serve another's.
 *
 *   - `@natlang/node`: `nodePlatform()`, `node:vm` evaluator, AsyncLocalStorage, the machine's call store, workspace packages.
 *   - `@natlang/browser`: `browserPlatform()`, the page's Function constructor, a synchronous context slot, OPFS call store.
 *   - the core (`workerdPlatform({ realm })`): a host-supplied `Realm`, AsyncLocalStorage, no call store unless given.
 */
import type { ContextStore } from './context.js';
import type { NatlangRuntimeOptions, NatlangTask } from './runtime.js';
import type { CallStoreLike } from '../calls/recorder.js';
import type { EvalEnvironment } from '../native/evaluator.js';
import type { ReturnErrorText } from '../native/return-errors.js';
import type { PythonHost, PythonResult } from '../native/folder-python.js';
import type { FolderBashOptions, FolderBashResult } from '../native/folder-shell.js';
import type { Folder } from '../native/scoped-fs.js';
import { type Realm } from '../native/realm.js';
export interface Platform {
    /** Names the platform in diagnostics. */
    readonly name: string;
    /** How the current natlang task follows control flow (AsyncLocalStorage, or a synchronous slot compiled code restores). */
    readonly contextStore: ContextStore;
    /** The evaluator for one task's evals (a `fresh` environment; the runtime asks for a new one when it needs one). */
    environment(options: NatlangRuntimeOptions): EvalEnvironment;
    /** The evaluator callable-folder module instances live in (a `retained` environment). */
    moduleRealm(): EvalEnvironment;
    /** The call record store of a runtime that names none; absent: calls are not recorded. */
    callStore?(): CallStoreLike | undefined;
    /** Platform modules callable-folder code can import (`natlang:neuralese`); a name that throws says why this platform lacks it. */
    readonly builtinModules?: Readonly<Record<string, () => unknown>>;
    /** Loads a package for callable-folder code of `task`; absent: package imports are unavailable. */
    packageLoader?(specifier: string, task: NatlangTask | undefined): unknown;
    /** Runs a shell command over a folder (the `bash` tool of folder calls); absent: the tool is unavailable on this platform. */
    readonly runFolderBash?: (folder: Folder, command: string, options?: FolderBashOptions) => Promise<FolderBashResult>;
    /** Runs a Python cell over a folder (the `python` tool of folder calls), its timeout enforced by the platform; absent: unavailable. */
    readonly runFolderPython?: (folder: Folder, source: string, host?: PythonHost, timeoutMs?: number) => Promise<PythonResult>;
    /** Wording of `return_result`'s value rejections when the runtime sets none (native/return-errors.ts). */
    readonly returnErrorText?: ReturnErrorText;
}
/**
 * A platform whose evaluators are the shared one over `realm`: everything TypeScript compilation, scope snapshots,
 * console and failure reports, with the realm running the JavaScript. For hosts that bring their own realm.
 */
export declare function realmPlatform(config: {
    name: string;
    contextStore: ContextStore;
    realm: Realm;
    callStore?: () => CallStoreLike | undefined;
    builtinModules?: Platform['builtinModules'];
    authority?: string;
}): Platform;
