/** The `refinements` settings of natlang.json (plans/REFINEMENT_TYPES.md section 3), parsed and validated. */
/** What the checker does with a probability inside the uncertainty band. */
export type BandPolicy = 'accept' | 'reject' | 'escalate';
/** `crisp`: a registered crisp checker decides when it returns a boolean, else the judge. `nl`: the judge only.
 * `shadow`: the judge decides and every crisp/judge disagreement is recorded to the trace. */
export type RefinementMode = 'crisp' | 'nl' | 'shadow';
export type PredicateSettings = {
    /** Accept at P(true) >= threshold (default 0.5). */
    threshold?: number;
    /** Probabilities inside [low, high] are uncertain; `policy` decides them. */
    band?: {
        low: number;
        high: number;
    };
    policy?: BandPolicy;
    mode?: RefinementMode;
};
export type RefinementSettings = PredicateSettings & {
    /** Model name (`models`) that judges; the call's own model when absent. */
    judge?: string;
    /** Model name an uncertain verdict escalates to under the `escalate` policy. */
    escalate?: string;
    /** Rejected return values the executor may repair before the call fails (default 3, or the model's maxFailureRepairs). */
    repairs?: number;
    /** Settings for one predicate (its normalized text), over the global ones. */
    predicates?: Record<string, PredicateSettings>;
    /** Declared result types of services, by `service.method`: natlang type text such as `Is<string, "a valid slug">`. */
    services?: Record<string, string>;
};
/** Validate the `refinements` object of natlang.json. */
export declare function parseRefinementSettings(value: unknown): RefinementSettings;
export declare const normalizePredicate: (predicate: string) => string;
