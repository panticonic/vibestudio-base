/**
 * Neuralese checks over checked TypeScript (S0 §2, §3, §8).
 *
 * `Neuralese<T, D>` is declared in the intrinsics as a branded type (`NeuraleseValue`). The TypeScript checker rejects
 * most misuse by itself; these checks add the natlang rules TypeScript allows: soft values in conditions, template
 * interpolation, arithmetic and comparison, serialisation, spreading and iteration. They also type the literals the
 * runtime substitutes for model-written native states (`__neuralese("nzs1_…")`) from their contextual type, and reject type
 * aliases that reach themselves through a function type.
 */
import ts from 'typescript';
import type { NatlangDiagnostic, SourceSpan } from './inline.js';
import type { Representation } from '../native/representation.js';
/** Brand property of `NeuraleseValue`; no natlang code reads it. */
export declare const NEURALESE_BRAND = "__natlangNeuralese";
/** Intrinsic the runtime writes in place of a model-written literal before compiling eval code. */
export declare const NEURALESE_LITERAL_INTRINSIC = "__neuralese";
export declare const DEFAULT_DIALECT = "DefaultDialect";
/** A model-written literal and the type its context gives it. */
export type NeuraleseLiteral = SourceSpan & {
    id: string;
    type: string;
    stopGradient?: true;
    sourceOccurrence?: string;
};
/** A soft expression that JavaScript would otherwise coerce to text. */
export type NeuraleseReadout = SourceSpan & {
    kind?: 'join' | 'array-string' | 'concat' | 'json' | 'error' | 'string-argument' | 'scalar-conversion' | 'string-replace' | 'array-map';
    argument?: number;
    conversion?: 'Number' | 'Boolean';
    conditional?: true;
    callback?: {
        start: number;
        end: number;
    };
};
type Report = (node: ts.Node, code: NatlangDiagnostic['code'], message: string) => void;
/** Exact private-literal transport metadata; this never adds a model operation. */
export declare function nativeLiteralUse(args: ts.NodeArray<ts.Expression>): {
    id: string;
    stopGradient?: true;
    sourceOccurrence?: string;
} | undefined;
/** The element type and dialect of a soft value type, or undefined when the type is not one. */
export declare function neuraleseParts(checker: ts.TypeChecker, type: ts.Type): {
    element: ts.Type;
    dialect: string;
} | undefined;
/** Natlang type text for a soft value type: `Neuralese<T>` or `Neuralese<T, "dialect">`. */
export declare function neuraleseTypeText(checker: ts.TypeChecker, type: ts.Type, location?: ts.Node): string | undefined;
/** Phantom property of `NatlangGenericFunction`: the callee's result is representation-generic. */
export declare const GENERIC_RESULT_BRAND = "__natlangGenericResult";
/** A call of a function with a representation-generic result and the instance its expected type picks. */
export type GenericInstantiation = {
    start: number;
    end: number;
    line: number;
    representation: Representation;
};
/**
 * Representation-generic results at their call sites (DECISIONS.md 2026-10-09). For each call of a natlang function
 * whose result is generic, the instance the checker inferred from the expected type: a `Neuralese` instantiation runs
 * the Neuralese instance, anything else (no expected type, or one that admits the crisp type) the crisp one. A call of
 * a natlang function with a crisp result where a `Neuralese` value is expected is reported with how to make it generic.
 */
export declare function checkGenericResults(checker: ts.TypeChecker, file: ts.SourceFile, report: Report, instantiations: GenericInstantiation[]): void;
/**
 * Report misuse of soft values in `file` and return the model-written literals it contains, typed from context.
 */
export declare function checkNeuralese(checker: ts.TypeChecker, file: ts.SourceFile, report: Report, options?: {
    recursiveTypes?: boolean;
    readouts?: NeuraleseReadout[];
    topLevelAwait?: boolean;
}): NeuraleseLiteral[];
/**
 * Reject a type alias that reaches itself through a function type (directly or through other aliases):
 * self-application would make recursion expressible. Recursive data aliases stay allowed. Applied to model-written
 * eval code; natlang signature and frontmatter types are checked by the native type environment (native/types.ts).
 */
export declare function checkRecursiveFunction(checker: ts.TypeChecker, alias: ts.TypeAliasDeclaration, report: Report): void;
export {};
