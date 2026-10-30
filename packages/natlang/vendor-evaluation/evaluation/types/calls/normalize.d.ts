/** Leaf values of the inputs by value, with the path that reaches each (the shortest when a value repeats). */
export declare function inputLeaves(inputs: Record<string, unknown>): Map<string, string>;
/** One eval program in normalized form. */
export declare function normalizeProgram(code: string, inputs?: Record<string, unknown>, leaves?: Map<string, string>): string;
/** The approach a successful agent call took: its successful evals, normalized. `answer-only` when it ran none. */
export declare function approachHash(evals: readonly string[], inputs: Record<string, unknown>): string;
