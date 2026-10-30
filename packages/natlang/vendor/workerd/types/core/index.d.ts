/**
 * @natlang/core: the platform-neutral natlang runtime for hosts that bring their own platform, built for workerd
 * (scripts/build-core.mjs). It has the compiler, the call kernel, the interpreter and the values, and none of the CLI, the
 * `node:sqlite` call store, the llama manager, Pyodide, or teacher and tuning code. A runtime needs a `Platform`:
 * `workerdPlatform({ realm })` here, or one built with `realmPlatform`.
 *
 * Nothing in this entry point reads process state or registers anything globally: two runtimes on different platforms
 * coexist, and a host that loads this module once per isolate shares one context store between its platforms.
 */
export * from '../runtime/index.js';
export { workerdPlatform } from './workerd.js';
export type { WorkerdPlatformOptions } from './workerd.js';
export { compileEval, evalRealmBody } from '../native/eval-compile.js';
export type { EvalCompileOptions } from '../native/eval-compile.js';
export { EvalFailure } from '../native/evaluator.js';
export type { EvalEnvironment, EvalRequest, EvalResult, HostEvent, EnvironmentMode } from '../native/evaluator.js';
export { compileProject, formatDiagnostics, NEUTRAL_RUNTIME_SPECIFIER } from '../compiler/project.js';
export type { BuildOptions, BuildResult, ProjectFiles, DefinitionManifest } from '../compiler/project.js';
export { compileVirtualProject, virtualProjectFiles, virtualSourceFiles, loadVirtualNatlang, loadVirtualCallables } from '../runtime/virtual-project.js';
export type { VirtualProject, VirtualProjectOptions, CompiledProject } from '../runtime/virtual-project.js';
export { loadNamedFunction, loadCallableFolder, NatlangSourceError } from '../runtime/loader.js';
export type { ItemRecord, NatlangRecord, ModuleRecord, NamespaceRecord, SourceFiles } from '../runtime/loader.js';
export * from '../compiler/host-cell.js';
export type { ModelTurn, ModelTurnRequest, ModelTurnDelta, ModelTurnOptions, ModelContentPart } from '../contracts.js';
export * from '../model/pi-translation.js';
export type { CallStoreLike } from '../calls/recorder.js';
export { TypeEnv, TypeSyntaxError, parseType, formatType, fitsType } from '../native/types.js';
export type { Type as NatlangType } from '../native/types.js';
export { ONCE_EFFECTS } from '../native/effects.js';
