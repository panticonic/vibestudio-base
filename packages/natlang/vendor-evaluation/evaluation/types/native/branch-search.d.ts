/**
 * Prefix-shared `branch@N` search & Step-Verifier ranking (`plans/NATLANG_COMPILER.md` §6.2, Track 4).
 *
 * Fans out N continuations sharing the exact prompt prefix (near-zero extra prefill cost on SGLang / llama.cpp),
 * ranks branches by crisp checks (`!malformed`, `!truncated`, valid `return_result` schema / `ensures`) strictly
 * before the `StepVerifierHead` score `V(h_t)`, and emits a `BranchWinRecord` whenever branch@N rescues a turn
 * that branch 0 (pass@1) would have failed — closing the self-play flywheel into OPSD, T2, and `ScopedExperienceKB`.
 */
import type { ModelTurn, ModelTurnRequest } from '../contracts.js';
export interface BranchCandidateEvaluation {
    index: number;
    turn: ModelTurn;
    crispOk: boolean;
    crispReason?: string;
    verifierScore: number;
}
export interface BranchWinRecord {
    callId: string | null;
    turnNumber: number;
    branches: number;
    selectedIndex: number;
    pass1CrispOk: boolean;
    selectedCrispOk: boolean;
    pass1Score: number;
    selectedScore: number;
    selectedTurn: ModelTurn;
}
export interface BranchSearchOptions {
    /** Number of prefix-shared candidate continuations to sample (typically 4). */
    branches: number;
    /** Sampling temperature for branches 1..N-1 when base temperature is 0 (default 0.6). */
    branchTemperature?: number;
    /** Optional StepVerifierHead scorer returning V(h_t) in [0, 1] for each branch. */
    scoreBranch?: (turn: ModelTurn, index: number, request: ModelTurnRequest) => Promise<number> | number;
    /** Optional crisp validator for a proposed return_result value (e.g. hoisted contract + ensures). */
    validateReturnValue?: (value: unknown) => Promise<{
        ok: boolean;
        reason?: string;
    }> | {
        ok: boolean;
        reason?: string;
    };
    /** Callback invoked whenever branch@N beats branch 0 (self-play win harvesting). */
    onBranchWin?: (win: BranchWinRecord) => void;
}
/** Deterministic crisp-first, verifier-second branch ranking (mirrors `step_verifier.py::rank_branches`). */
export declare function rankBranchCandidates(candidates: readonly BranchCandidateEvaluation[]): BranchCandidateEvaluation[];
/** Execute N prefix-shared continuations in parallel and select the highest-ranked branch. */
export declare function runPrefixSharedBranchSearch(baseRequest: ModelTurnRequest, sampleTurn: (request: ModelTurnRequest, branchIndex: number) => Promise<ModelTurn> | ModelTurn, options: BranchSearchOptions, meta: {
    callId: string | null;
    turnNumber: number;
}): Promise<{
    selected: BranchCandidateEvaluation;
    ranked: BranchCandidateEvaluation[];
    branchWin: boolean;
}>;
