import { type TargetArgument } from '../runtime/target-arguments.js';
export declare const PACKAGE_SCHEMA: "natlang.package/v2";
/** A launchable application target: a TypeScript entry module and the function it exports. */
export type NatlangTarget = {
    entry: string;
    /** Relative path to a portable adaptation artifact included in this package. */
    adaptation?: string;
    /** Exported function receiving the target context; default `main`. */
    export?: string;
    description?: string;
    authority?: string[];
    commands?: string[];
    /** Ordered positional arguments with natlang types (runtime/target-arguments.ts): `natlang run` checks them into
     * `context.arguments`, and the dashboard renders its run form from them. */
    arguments?: TargetArgument[];
};
export type NatlangPackageManifest = {
    schema: typeof PACKAGE_SCHEMA;
    name: string;
    version: string;
    description?: string;
    include: string[];
    targets?: Record<string, NatlangTarget>;
    exports?: Record<string, string>;
    dependencies?: Record<string, string>;
    engines?: {
        natlang?: string;
        node?: string;
    };
    /** What the runtime records of this program's calls (plans/TRACE_SPECIALIZATION.md §3.2). */
    recording?: {
        exclude?: string[];
    };
    /** How far stored compilations may serve this program's calls; the machine setting still bounds it. */
    specialization?: 'off' | 'shadow' | 'on';
    /** How `Is<T, "predicate">` slots are checked: threshold, uncertainty band, policy, mode (plans/REFINEMENT_TYPES.md). */
    refinements?: Record<string, unknown>;
    /** Fused hand-offs between functions: mode, planner, certificate (plans/FUSED_PIPELINES.md); validated by `parseFusionSettings`. */
    fusion?: Record<string, unknown>;
    /** The model the program is built, warmed and run with unless the command selects another (`--profile`, `--provider`,
     * `--model`, NATLANG_PROFILE/SERVER/PROVIDER): a machine profile by name, a stock model, or profile fields. */
    model?: ProgramModel;
    /** The calls `natlang build --warm` runs ahead of time: their traces are recorded and their prompt prefixes prefilled. */
    warmup?: WarmupCase[];
};
export type ProgramModel = {
    profile?: string;
    stock?: string;
    provider?: string;
    model?: string;
    endpoint?: string;
    request?: Record<string, unknown>;
    contextTokens?: number;
    parallel?: number;
    escalate?: string;
};
/** One warm-up call: a named `.nl` function of the package and its inputs by parameter name. */
export type WarmupCase = {
    name?: string;
    function: string;
    inputs: Record<string, unknown>;
};
export declare function packagePath(value: unknown, label: string): string;
export declare function parsePackageManifest(value: unknown): NatlangPackageManifest;
