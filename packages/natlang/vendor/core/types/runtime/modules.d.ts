import type { Platform } from './platform.js';
import type { EvalEnvironment } from '../native/evaluator.js';
import { type InlineLambdaPlan } from '../compiler/inline.js';
import { type ItemRecord, type ModuleRecord } from './loader.js';
/**
 * Importing a platform module this platform cannot provide (code `module-unavailable`); `reason` teaches what to do.
 * Platforms list their modules in `Platform.builtinModules`; one that cannot provide a module lists a factory that throws this.
 */
export declare class ModuleUnavailableError extends Error {
    readonly specifier: string;
    readonly code = "module-unavailable";
    constructor(specifier: string, reason: string);
}
export declare function hasBuiltinModule(platform: Platform, specifier: string): boolean;
export declare function builtinModule(platform: Platform, specifier: string): unknown;
export declare class ModuleRealmChangedError extends Error {
    readonly code = "module-realm-changed";
    constructor();
}
/** The evaluator `platform`'s callable-folder modules (and compiled virtual projects) run in. */
export declare function platformModuleRealm(platform: Platform): EvalEnvironment;
/** `await-restoring`: the module's awaits restore the natlang task (platforms whose context store loses it across awaits). */
export type ModuleTarget = 'default' | 'await-restoring';
/** The target a platform's modules compile for: its context store decides. */
export declare const moduleTarget: (platform: Platform) => ModuleTarget;
/** Compile one module to CommonJS-style JavaScript for evaluation. */
export declare function compileModule(record: ModuleRecord, level: Record<string, ItemRecord>, inventory?: (plans: InlineLambdaPlan[]) => void, target?: ModuleTarget): string;
/** The live exports of a module in its folder `level` (its sibling items). */
export declare function moduleInstance(platform: Platform, record: ModuleRecord, level: Record<string, ItemRecord>): Record<string, unknown>;
export declare function moduleRealmUsesAsync(platform: Platform): boolean;
/** Initialize a callable module and all static sibling dependencies through the
 * asynchronous evaluator. No guest source executes in the native loader. */
export declare function moduleInstanceAsync(platform: Platform, record: ModuleRecord, level: Record<string, ItemRecord>): Promise<Record<string, unknown>>;
