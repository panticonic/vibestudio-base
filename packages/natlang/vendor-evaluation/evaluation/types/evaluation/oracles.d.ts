import { jsonStringRecordCanonical } from '../oracle-kit/json-record.js';
export { jsonStringRecordCanonical };
/** Answer checks used by generated and dataset-backed teacher cases. */
export type OracleLevel = 'exact' | 'normalized' | 'span' | 'agreement' | 'judged' | 'constraints';
export declare const ORACLE_LEVELS: readonly OracleLevel[];
/** Baseline answer comparison version; explicit specialized comparators carry their own verdict version. */
export declare const ANSWER_COMPARISON_VERSION = "normalized-decimal-exact/2";
export type NumericListFieldSpec = {
    key: string;
    separator: '; ';
    empty_value: 'none';
};
export type SemanticStructuredComparisonSpec = {
    schema_version: string;
    unordered_paths: string[];
    prose_paths: string[];
    ordered_paths?: string[];
    witness_review_required?: boolean;
    witness_policy?: string;
    prose_policy?: string;
};
export type OracleSpec = OracleLevel | {
    level: OracleLevel;
    alternates?: unknown[];
    threshold?: number;
    normalization?: 'qa' | 'qa-string-map' | 'named-tree' | 'json-string-record' | (string & {});
    comparison_spec?: SemanticStructuredComparisonSpec;
    /** Explicit answer-map keys whose string values are exact decimal quantities. */
    numeric_keys?: string[];
    /** Explicit answer-map keys whose values are ordered exact unsigned integer lists. */
    numeric_list_fields?: NumericListFieldSpec[];
    /** Explicit answer-map keys whose lowercase strings are unsigned numerals in a declared base. */
    radix_fields?: Array<{
        key: string;
        base: number;
    }>;
    rubric?: string;
    context?: unknown;
    [key: string]: unknown;
};
/** Apply only explicitly declared unordered array paths; object keys are already order-free. */
export declare function declaredStructuralCanonical(value: unknown, unorderedPaths: string[], prosePaths?: string[], ignoreProse?: boolean): string | null;
export type OracleVerdict = {
    accepted: boolean;
    level: OracleLevel;
    score?: number;
    verdict?: string;
    needs_review?: boolean;
    comparison_version?: string;
};
/** TreeDST's author implementation keys children by name; sibling order is not semantic.
 * Reject duplicate names, extra fields and malformed nodes instead of silently dropping them.
 */
export declare function namedTreeCanonical(value: unknown): string | null;
/** JSON string maps keep exact values unless a source contract explicitly marks decimal-valued keys. */
export declare function jsonStringRecordWithNumericKeysCanonical(value: unknown, numericKeys?: unknown): string | null;
/** Canonicalize only explicitly declared unsigned radix fields to exact BigInt values.
 * Digits are lowercase 0-9a-z, bases 2..36, and leading zeroes are equivalent.
 * No signs, uppercase, whitespace, floats, or undeclared-field coercion are accepted.
 */
export declare function jsonStringRecordWithRadixFieldsCanonical(value: unknown, radixFields?: unknown): string | null;
/** Canonicalize explicitly declared measured-count lists only. Grouping commas are accepted
 * only in standard three-digit groups; order and list membership remain exact. */
export declare function jsonStringRecordWithNumericListFieldsCanonical(value: unknown, numericListFields?: unknown): string | null;
/** Canonical map for extractive QA: keys stay exact; answer values use SQuAD token normalization. */
export declare function qaStringMapCanonical(value: unknown): string | null;
/** Multiset token F1; repeated words count only when they occur on both sides. */
export declare function spanF1(actual: unknown, expected: unknown, qa?: boolean): number;
/**
 * How much of a many-part answer matches, from 0 to 1: for answers made of many judgments whose gold is itself noisy
 * (dataset labels). A record of numbers (counts by label) scores 1 - L1 distance / both totals, an array the share of
 * equal positions, a number 1 - its relative error; anything else is all or nothing.
 */
export declare function agreement(actual: unknown, expected: unknown): number;
/** File contracts fail closed on malformed reports and unverified rewrites. */
export declare const DATA_QUALITY_VERSION = 3;
export declare const FILE_CONTENT_COMPARISON_VERSION = "json-content/2";
export type FilesOracle = {
    compare?: 'content' | 'exact' | 'moves' | 'rewrite' | 'csv' | 'counts' | 'json-string-record' | 'qa-string-map' | 'json-semantic-structured' | 'markdown-terminal-newline' | (string & {});
    threshold?: number;
    span?: number;
    total?: number;
    rubric?: string;
    alternates?: Record<string, string[]>;
    /** JSON outputs whose prose-only fields may vary while all other structure remains exact. */
    json_report_paths?: string[];
    comparison_spec?: SemanticStructuredComparisonSpec;
    /** Source files bound into the prose judge context for JSON reports. */
    rationale_context_paths?: string[];
    /** Explicit answer file for return-value consistency when the default answers.json names do not apply. */
    return_path?: string;
    /** Explicit answer-map keys whose string values are exact decimal quantities. */
    numeric_keys?: string[];
    /** Explicit answer-map keys whose values are ordered exact unsigned integer lists. */
    numeric_list_fields?: NumericListFieldSpec[];
    /** Explicit answer-map fields whose lowercase values are unsigned numerals in a declared base. */
    radix_fields?: Array<{
        key: string;
        base: number;
    }>;
    /** Exact output-map label domain for bounded ordinal source references. */
    ordinal_levels?: string[];
    /** Maximum per-entry ordinal distance for the explicitly selected output map. */
    ordinal_distance_max?: number;
    /** Explicitly allowlisted Markdown files whose one terminal line ending may vary. */
    markdown_terminal_newline_paths?: string[];
    /** Reports may only quote the corresponding original source. */
    quote_sources?: Record<string, string>;
    /** Alternate annotated clauses, keyed by the report row's id. */
    quote_alternates?: Record<string, string[]>;
    return_count?: 'changed' | 'csv_nonempty' | 'counts';
    report?: string;
};
export type FilesVerdict = {
    accepted: boolean;
    score: number;
    passed: number;
    items: number;
    failed: string[];
    comparison_version?: string;
    quality_version: number;
    errors: string[];
    pending: string[];
    positive_recall?: number;
    positive_precision?: number;
    judgments?: Record<string, {
        accepted: boolean;
        verdict: string;
        needs_review?: boolean;
    }>;
};
export type OracleJudge = (input: {
    actual: unknown;
    expected: unknown;
    rubric: string;
}) => Promise<{
    accepted: boolean;
    verdict: string;
    needs_review?: boolean;
}>;
/** Strict CSV, including multiline quoted cells. Never silently overwrite duplicate row ids. */
export declare function csvRows(text: string): string[][];
export declare function countLines(text: string): Record<string, number>;
/** JSON formatting is not data. Preserve strings, types, array order and every key;
 * reject duplicate keys and unsafe numeric values rather than silently losing data.
 */
export declare function jsonFileCanonical(text: string): string | null;
export declare function fileContentEqual(path: string, actual: string | undefined, expected: string | undefined): boolean;
/** Remove at most one terminal LF or CRLF. No other whitespace or line-ending normalization occurs. */
export declare function markdownTerminalNewlineBody(text: string): string;
export declare function markdownTerminalNewlineEqual(path: string, actual: string | undefined, expected: string | undefined): boolean;
/** Compare a source-bound map of ordinal labels without relaxing its keys or label domain. */
export declare function ordinalDistanceRecordReview(actual: unknown, expected: unknown, levels: unknown, maxDistance: unknown): {
    accepted: boolean;
    errors: string[];
    entries: Array<Record<string, unknown>>;
} | {
    accepted: boolean;
    errors: string[];
    entries: {
        key: string;
        actual: unknown;
        expected: unknown;
        ordinal_distance: number | null;
        accepted: boolean;
    }[];
};
export declare function checkFiles(actual: Record<string, string>, expected: Record<string, string>, input: Record<string, string>, spec?: FilesOracle, judgments?: FilesVerdict['judgments']): FilesVerdict;
/** Non-reference rewrites require a separately configured judge; a word-overlap heuristic cannot certify them. */
export declare function checkFilesWithJudge(actual: Record<string, string>, expected: Record<string, string>, input: Record<string, string>, spec?: FilesOracle, judge?: OracleJudge): Promise<FilesVerdict>;
/** Returned summaries must describe the actual output, independently of tolerance against noisy gold. */
export declare function fileReturnValue(files: Record<string, string>, input: Record<string, string>, spec: FilesOracle): unknown;
export declare function checkFileReturn(actual: unknown, files: Record<string, string>, input: Record<string, string>, spec: FilesOracle): boolean;
/** A judge's verdict is supplied by the collection caller; no case can self-certify its own prose. */
export declare function checkOracle(actual: unknown, expected: unknown, oracle?: OracleSpec, judge?: (input: {
    actual: unknown;
    expected: unknown;
    rubric: string;
}) => Promise<{
    accepted: boolean;
    verdict: string;
    needs_review?: boolean;
}>): Promise<OracleVerdict>;
