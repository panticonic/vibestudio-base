export type IterationEvent<T> = Readonly<{
    kind: 'initial' | 'step' | 'review' | 'done' | 'error';
    sequence: number;
    iteration: number;
    iterationId: string;
    siteId: string;
    state?: T;
    review?: ProgressVerdict;
    error?: string;
}>;
export type ProgressVerdict = {
    verdict: 'continue' | 'divergent';
    reason: string;
};
export type StepRecord = {
    iteration: number;
    callId: string;
    elapsedMs: number;
    stateHash: string;
};
export interface IterationTrajectory<T> {
    readonly iterationId: string;
    readonly siteId: string;
    readonly length: number;
    state(index: number): T;
    states(start?: number, end?: number): T[];
    steps(start?: number, end?: number): StepRecord[];
    repeats(): {
        iteration: number;
        firstSeen: number;
    }[];
    summary(): {
        iterations: number;
        activeMs: number;
        repeatedStates: number;
        reviews: number;
        statistics: unknown;
    };
}
export type ProgressJudgeFunction = <T>(trajectory: IterationTrajectory<T>, context: JudgeContext) => Promise<ProgressVerdict>;
export type JudgeContext = {
    stepName: string;
    stepInstructions?: string;
    predicateInstructions?: string;
    stateType?: string;
};
export type SiteStatistics = {
    successes: number;
    meanSteps: number;
    m2Steps: number;
    meanMs: number;
    m2Ms: number;
    failures: number;
    wallMs: number;
};
export interface IterationStatisticsStore {
    read(key: string): SiteStatistics | undefined | Promise<SiteStatistics | undefined>;
    write(key: string, value: SiteStatistics): void | Promise<void>;
    reset?(prefix?: string): void | Promise<void>;
    export?(): Record<string, SiteStatistics> | Promise<Record<string, SiteStatistics>>;
}
/** Default statistics store: in memory for the lifetime of the process. */
export declare class MemoryIterationStatistics implements IterationStatisticsStore {
    private readonly values;
    read(key: string): SiteStatistics | undefined;
    write(key: string, value: SiteStatistics): void;
    reset(prefix?: string): void;
    export(): {
        [k: string]: SiteStatistics;
    };
}
declare class IterationFailure extends Error {
    readonly lastState: unknown;
    readonly trajectory: IterationTrajectory<unknown>;
    constructor(message: string, lastState: unknown, trajectory: IterationTrajectory<unknown>, options?: ErrorOptions);
}
/** A progress review judged the run divergent. */
export declare class IterationDivergedError extends IterationFailure {
    readonly reason: string;
    constructor(reason: string, lastState: unknown, trajectory: IterationTrajectory<unknown>);
}
/** A step or stopping predicate failed; the last checked state and trajectory are attached. */
export declare class IterationStepError extends IterationFailure {
    constructor(message: string, lastState: unknown, trajectory: IterationTrajectory<unknown>, cause: unknown);
}
/** A caller-supplied `withLimit` bound was reached. */
export declare class IterationLimitError extends IterationFailure {
    /** `iteration-unbounded` when a TypeScript predicate (or review-off loop) has neither measure nor step limit; `iteration-measure-exhausted` when the measure reached 0 with the stopping condition still false. */
    readonly code?: 'iteration-unbounded' | 'iteration-measure-exhausted';
    constructor(message: string, lastState: unknown, trajectory: IterationTrajectory<unknown>, code?: 'iteration-unbounded' | 'iteration-measure-exhausted');
}
type Step<T> = (state: T, ...args: unknown[]) => T | Promise<T>;
type Done<T> = (state: T) => boolean | Promise<boolean>;
/** Decide whether a completed step should be reviewed. Bootstrap sites are reviewed occasionally. */
export declare function reviewDue(stats: SiteStatistics | undefined, steps: number, activeMs: number, lastReviewAt: number): boolean;
/** The progress judge's instructions: the body of the built-in program builtin/progressJudge.nl. */
export declare const DEFAULT_JUDGE_INSTRUCTIONS: string;
/**
 * System prompt addition for a natural-language stopping predicate. Such a loop has no hard bound, so its predicate is
 * told what it is and biased against holding out for a state the loop will never reach; a loop that is stuck is the
 * progress judge's to stop.
 */
export declare function predicatePrompt(completedSteps: number, unchangedSteps: number): string;
/** The library progress judge: a natlang lambda with read-only access to the whole trajectory. */
export declare const defaultProgressJudge: ProgressJudgeFunction;
export declare class Iteration<T> {
    private readonly step;
    private readonly initial;
    private readonly fixed;
    private observers;
    private judge?;
    private siteId?;
    private compilerSite?;
    private limit;
    private measure?;
    private started;
    private frame?;
    readonly [Symbol.toStringTag] = "Iteration";
    constructor(step: Step<T>, initial: T, fixed: unknown[]);
    onStep(observer: (event: IterationEvent<T>) => void | Promise<void>): this;
    checkProgress(judge: ProgressJudgeFunction | 'off'): this;
    /** A well-founded workflow measure, independent of semantic reviews. */
    withMeasure(remaining: (state: T) => number): this;
    withSiteId(id: string): this;
    withLimit(limit: {
        maxSteps?: number;
        deadlineMs?: number;
    }): this;
    /** Run in a fixed task frame (used when an interpreter session creates the iteration). */
    inFrame(frame: import('./context.js').Frame | undefined): this;
    /** Set by compiled code with the call site's stable identity. */
    withCompilerSite(id: string): this;
    until(done: Done<T>): Promise<T>;
    /** What a printed iteration is: nothing runs until `.until(done)` is awaited. */
    toString(): string;
    streamUntil(done: Done<T>): AsyncIterable<IterationEvent<T>> & {
        readonly __natlangIterationStream: true;
    };
    private run;
}
/** Free form of the operator; `callable.iterateOn(initial, ...args)` is the same thing. */
export declare function iterateOn<T>(step: Step<T>, initial: T, ...fixed: unknown[]): Iteration<T>;
export {};
