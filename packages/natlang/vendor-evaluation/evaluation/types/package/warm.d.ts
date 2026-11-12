export declare const BUILD_LOCK_SCHEMA = "natlang.build-lock/1";
export type WarmPrefix = {
    sha256: string;
    chars: number;
    tokens: number;
    bytes: number;
    file: string;
    restoredSlots: number;
    created: boolean;
    /** Tokens actually prefilled when the state was created (fewer than `tokens` when a saved base was restored first). */
    prefilled?: number;
    /** The shared base state (llama/warm.ts) this opening was built on. */
    base?: string;
};
export type WarmCaseResult = {
    name: string;
    function: string;
    outcome: string;
    detail?: string;
    wall_ms: number;
    calls: number;
    tokens_in: number;
    tokens_out: number;
    call_id: string | null;
};
export type BuildLock = {
    schema: typeof BUILD_LOCK_SCHEMA;
    program: {
        name: string | null;
        version: string | null;
        root: string;
    };
    builtAt: string;
    natlang: string;
    model: {
        profile: string;
        kind: string;
        model: string;
        executor: string;
        release: {
            id: string;
            sha256: string;
            file: string;
            quant: string;
            source: string;
            revision: string;
            template: string;
        } | null;
        request: Record<string, unknown> | null;
        runtime: {
            version: string;
            build: number;
            label: string;
        } | null;
    };
    tuning: {
        release: string;
        base: string;
    } | null;
    functions: {
        name: string;
        source: string;
        params: string[];
        returns: string;
        description?: string;
    }[];
    warm: {
        at: string;
        modelSha256: string | null;
        runtimeBuild: number | null;
        /** The llama.cpp binary's `b<build>g<commit>` label (llama/models.ts runtimeLabel). */
        runtime: string | null;
        prefixes: WarmPrefix[];
        cases: WarmCaseResult[];
        wall_ms: number;
    } | null;
};
export declare const buildLockPath: (buildDirectory: string) => string;
export declare function readBuildLock(buildDirectory: string): BuildLock | undefined;
export declare function writeBuildLock(buildDirectory: string, lock: BuildLock): string;
