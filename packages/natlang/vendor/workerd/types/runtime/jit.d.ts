import { type PluggableSetting } from './pluggable.js';
export type JitTier = '0' | '0.5' | '1' | '1.5' | '2' | 'crisp';
export interface SiteStats {
    siteId: string;
    callCount: number;
    verifiedExampleCount: number;
    refinementFailureRate: number;
    meanDecisionConfidence: number | null;
    repairRate: number;
    isSynthesizedLiteral: boolean;
    hasCrispFastPath: boolean;
    hasCompiledWeights: boolean;
    hasTier15Weights: boolean;
    hasTier2Weights: boolean;
    compilerAvailable: boolean;
}
export interface TierThresholds {
    /** Minimum calls before promoting from Tier 0 -> Tier 0.5 primed state. */
    primedMinCalls?: number;
    /** Minimum calls before promoting to Tier 1 compiled weights (synthesized literals compile at 0). */
    compileMinCalls?: number;
    /** Minimum verified examples to recommend Tier 1.5 latent-manifold TTT. */
    refineMinExamples?: number;
    /** Minimum verified examples to recommend Tier 2 full tune. */
    tuneMinExamples?: number;
    /** Refinement failure rate above which a site escalates toward refinement/tuning. */
    failureRateThreshold?: number;
    /** Decision confidence floor below which a site escalates toward refinement/tuning. */
    confidenceFloor?: number;
}
export interface CompiledProvenance {
    siteId: string;
    headerSha: string;
    compilerSha: string;
    policySha: string;
    baseGgufSha256?: string;
}
export interface CompiledSiteEntry {
    cacheKey: string;
    tier: '0.5' | '1' | '1.5' | '2';
    provenance: CompiledProvenance;
    adapterId: string | null;
    nativeStateId: string | null;
    createdAtMs: number;
    hits: number;
}
/** Deterministic SHA-256 hex digest of UTF-8 text (browser/workerd/Node portable). */
export declare function sha256Hex(text: string): string;
/** Exact provenance cache key binding site, header, compiler, policy, and base GGUF identity. */
export declare function compiledCacheKey(p: CompiledProvenance): string;
/** Crisp tier-selection policy (hot-path twin of `chooseTier.nl`). */
export declare function chooseTierCrisp(stats: SiteStats, thresholds?: TierThresholds): JitTier;
export interface ChooseTierPolicyOptions {
    mode?: PluggableSetting;
    nl?: (stats: SiteStats, thresholds?: TierThresholds) => Promise<JitTier> | JitTier;
    thresholds?: TierThresholds;
}
/** Create the pluggable `chooseTier` policy (crisp default; supports `nl` and `shadow` modes). */
export declare function createChooseTierPolicy(options?: ChooseTierPolicyOptions): (stats: SiteStats) => Promise<JitTier>;
/** Bounded LRU cache for compiled site/closure artifacts keyed by exact provenance. */
export declare class CompiledSiteCache {
    private readonly entries;
    private readonly maxEntries;
    constructor(maxEntries?: number);
    get size(): number;
    get(provenance: CompiledProvenance): CompiledSiteEntry | undefined;
    put(entry: Omit<CompiledSiteEntry, 'cacheKey' | 'hits'>): CompiledSiteEntry;
    invalidatePolicy(policySha: string): number;
}
export interface CompileClosureRequest {
    siteId: string;
    resolvedHeaderText: string;
    partialArgsJson?: string;
    compilerSha: string;
    policySha: string;
    baseGgufSha256?: string;
}
/**
 * Compile-on-creation hook for runtime-synthesized NL literals (`nl\`...\`` with captures)
 * and static partial applications (`.partial(arg)`, `.in(ctx)`).
 */
export declare function compileOnCreateClosure(cache: CompiledSiteCache, req: CompileClosureRequest, compileFn: (req: CompileClosureRequest, headerSha: string) => Promise<{
    adapterId: string | null;
    nativeStateId: string | null;
}>): Promise<CompiledSiteEntry>;
