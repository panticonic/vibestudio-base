import type { ItemRecord, ModuleRecord } from './loader.js';
export type EnsuresClause = {
    check: string;
    message?: string;
} | {
    predicate: string;
    against?: string[];
    message?: string;
};
/** The syntax error of `expression` as a TypeScript expression, or undefined when it is one. */
export declare function expressionError(expression: string): string | undefined;
/** The free identifiers of a TypeScript expression (names it reads that it does not bind itself). */
export declare function freeNames(expression: string): string[];
/**
 * The problem with a contract or measure expression of `name` whose parameters are `params`: a name it uses that is not
 * `result` (contracts only), an argument, an item of the companion folder or a standard global. Undefined when fine.
 */
export declare function unknownName(expression: string, params: readonly string[], items: readonly string[], withResult: boolean): string | undefined;
/** The companion-folder items a `check:` clause names: they judge the call, so its edits cannot change them. */
export declare function checkItems(clauses: readonly EnsuresClause[] | undefined, params: readonly string[], codebase: Record<string, unknown>): string[];
/** Validate an `ensures:` frontmatter value against the function's parameter names; returns the clauses or throws. */
export declare function parseEnsures(value: unknown, params: readonly string[]): EnsuresClause[];
/**
 * The synthetic module of a function's contract checks and measure: `check_<i>(result, ...args, items)` and
 * `measure(...args, items)`, each returning its expression's value. `items` holds the companion folder's values.
 */
export declare function expressionModule(owner: {
    id: string;
    name: string;
    source?: string;
    revision?: string;
    types: Record<string, string>;
    params: readonly string[];
}, clauses: readonly EnsuresClause[] | undefined, measure: string | undefined, items: readonly string[]): ModuleRecord;
/** A read-only copy of plain data (arrays and plain objects frozen all the way down); anything else as it is. */
export declare function readOnly<T>(value: T, depth?: number): T;
export type { ItemRecord };
