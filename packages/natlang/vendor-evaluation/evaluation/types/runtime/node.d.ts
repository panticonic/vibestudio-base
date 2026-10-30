import { type EvalEnvironment, type EnvironmentMode } from '../native/evaluator.js';
import type { NatlangRuntimeOptions } from './runtime.js';
import type { Platform } from './platform.js';
import { type PythonHost } from '../native/folder-python.js';
import { type FolderBashOptions, type FolderBashResult } from '../native/folder-shell.js';
import type { Folder } from '../native/scoped-fs.js';
/**
 * The Node platform: what `createNatlangRuntime` uses here when no `platform` is passed. It reads the process
 * environment (`NATLANG_CALL_STORE`, `NATLANG_SPECIALIZATION`, `NATLANG_RETURN_ERROR_TEXT`) where the kernel, which reads
 * none, is configured. Build a variant with an object spread (`{ ...nodePlatform(), builtinModules }`): module state belongs
 * to the platform value, so a variant has its own module instances.
 */
export declare function nodePlatform(): Platform;
/** Run a Python cell over `folder`; its timeout is enforced by the Node watchdog unless `host` brings another. */
export declare function runFolderPython(folder: Folder, source: string, host?: PythonHost, timeoutMs?: number): Promise<import("../native/folder-python.js").PythonResult>;
/** Run a shell command over `folder`; its Python cells are bounded by the Node watchdog unless `options.python` brings another. */
export declare function runFolderBash(folder: Folder, command: string, options?: FolderBashOptions): Promise<FolderBashResult>;
export declare const createNatlangRuntime: (options?: NatlangRuntimeOptions) => import("./runtime.js").NatlangRuntime, compileVirtualProject: (project: import("./virtual-project.js").VirtualProject, runtime: Record<string, unknown>, options?: Omit<import("./virtual-project.js").VirtualProjectOptions, "platform"> & {
    platform?: Platform;
}) => import("./virtual-project.js").CompiledProject, projectEntry: (files: Record<string, string>, path: string, runtimeNamespace?: Record<string, unknown>, platform?: Platform) => (inputs: Record<string, unknown>) => Promise<unknown>, loadVirtualNatlang: (files: Record<string, string>, path: string, root?: string, platform?: Platform) => import("./callable.js").NatlangCallable, loadVirtualCallables: (files: Record<string, string>, dir?: string, root?: string, platform?: Platform) => Record<string, unknown>;
/**
 * Explicit opt-in for an *owned* guest interpreter: a platform (`base`, the Node platform by default) whose per-call
 * and module evaluators both come from `factory`. The factory is supplied by the embedding application (for example
 * tracing-js-self/natlang), so the natlang distribution never silently imports an untraced fallback runtime.
 * This does NOT claim general callback/package/module compatibility: a bounded interpreter must reject any
 * unsupported natlang-generated code.
 *
 * Pass the result as `platform` to `createNatlangRuntime`. Module instances belong to the platform value, so an
 * owned platform never serves exports created by another authority.
 */
export declare function ownedTracingPlatform(factory: (mode: EnvironmentMode, options?: NatlangRuntimeOptions) => EvalEnvironment, base?: Platform): Platform;
/**
 * A platform (`base`, the Node platform by default) with an asynchronous, selected-semantic executor at both Natlang seams.
 *
 * Synchronous entry and module APIs deliberately throw: falling back to the
 * process V8 evaluator would misrepresent semantic execution as model-owned.
 * The driver must implement its actual selection, tool and observation loop;
 * this installation only wires and checks its authority.
 */
export declare function selectedSemanticPlatform(factory: (mode: EnvironmentMode, options?: NatlangRuntimeOptions) => EvalEnvironment, base?: Platform): Platform;
/**
 * Compatibility-first integration. Unlike ownedTracingPlatform this
 * deliberately permits the ordinary Node evaluator. A native selection has
 * NO owned instruction trace and MUST NOT enter replay-verified training data.
 *
 * Routing happens before evaluation, never as a catch-and-retry after partially
 * executed guest code or committed external side effects.
 */
export declare function hybridTracingPlatform(factory: (mode: EnvironmentMode, options?: NatlangRuntimeOptions) => EvalEnvironment, options?: {
    route?: (request: {
        kind: 'execute' | 'executeAsync' | 'evaluateModule';
        mode: EnvironmentMode;
        code: string;
        path?: string;
    }) => 'owned' | 'native';
    onNativeExecution?: (event: {
        operation: 'execution.provenance';
        authority: 'native-untraced/1';
        kind: string;
        mode: EnvironmentMode;
        path?: string;
    }) => void;
}, base?: Platform): Platform;
/**
 * Native observation mode for unsupported JS/TS. Records execution boundaries
 * but does NOT invent VM operation events or an exact-replayable owned archive.
 * Retained callable exports can execute after module installation: those calls
 * are outside this bootstrap-level observer.
 */
export declare function observedNativeTracingPlatform(onTrace: (record: {
    schema: 'natlang-native-observation/1';
    phase: 'start' | 'completed' | 'failed' | 'settled';
    kind: 'execute' | 'executeAsync' | 'evaluateModule' | 'exportCall';
    mode: EnvironmentMode;
    code: string;
    path?: string;
    exportName?: string;
    invocationId?: number;
    completion?: 'returned' | 'fulfilled' | 'rejected';
    error?: string;
}) => void, base?: Platform): Platform;
export * from './index.js';
export * from '../calls/index.js';
export { CallStore } from '../calls/store.js';
export { machineStoreRoot, openMachineStore } from '../machine-store.js';
export type { CallSummary, CallFilter, HotDefinition, AuditJob, FindingInput, FindingRow, SavingsRow } from '../calls/store.js';
export * from '../calls/replay.js';
export * from '../calls/judge.js';
export * from '../calls/mining.js';
export * from '../calls/offline.js';
export * from '../calls/specializer.js';
export * from '../calls/groups.js';
export * from '../calls/findings.js';
export * from '../calls/corpus.js';
export { tracesService, TRACES_DECLARATIONS } from '../calls/service.js';
export type { TraceCall } from '../calls/service.js';
export { loadNatlang, loadCallables, applicationContextRecords, nodeSourceFiles, fileTraceSink } from './node-files.js';
