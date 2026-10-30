import ts from 'typescript';
import { type TargetDescriptor } from './targets.js';
import { type GenericInstantiation, type NeuraleseLiteral, type NeuraleseReadout } from './neuralese.js';
export type SourceSpan = {
    file: string;
    start: number;
    end: number;
    line: number;
    column: number;
};
export type InlineRebindSite = {
    start: number;
    end: number;
    templateStart: number;
    templateEnd: number;
    captureSources: Record<string, CapturePlan['source']>;
};
export type NatlangDiagnostic = SourceSpan & {
    code: 'nl-unknown-return' | 'nl-unknown-parameter' | 'nl-not-called' | 'nl-not-tag' | 'nl-shadowed' | 'nl-ambiguous-signature' | 'nl-sync-callback' | 'nl-parameter-collision' | 'nl-unknown-name' | 'nl-spread' | 'nl-const-capture-write' | 'forbidden-loop' | 'forbidden-dynamic-code' | 'recursion' | 'callable-scope' | 'reserved-property' | 'duplicate-site' | 'iterate-step' | 'iterate-predicate' | 'module-collision' | 'typescript' | 'nl-undeclared-type' | 'neuralese-opaque-access' | 'neuralese-condition' | 'neuralese-untyped-literal' | 'neuralese-nested' | 'neuralese-readout-sync' | 'neuralese-crisp-result' | 'type-recursive-function' | 'neuralese-file' | 'nl-explicit-captures' | 'nl-type-arguments' | 'undeclared-field' | 'untrusted-instruction';
    message: string;
    severity: 'error' | 'warning';
};
export type CapturePlan = {
    name: string;
    type: TargetDescriptor;
    mutable: boolean;
    source: 'input' | 'local' | 'block' | 'handle';
    /** Offset of the first mention in the template, relative to the source file. */
    mentionSpan: number;
    /**
     * Explicit captures (`nl.with`): `snapshot` takes the value when the function is created; `live` reads the let
     * binding at each call and writes it back. Implicit captures have no mode: data lets are live, functions by value.
     */
    mode?: 'snapshot' | 'live';
    /** Explicit capture is evaluated at creation but hidden when a callable parameter has the same name. */
    shadowedByParameter?: true;
};
export type InlineLambdaPlan = {
    programId?: string;
    sourceSpan: SourceSpan;
    /** Authenticated prior-eval source for a template recompiled from a persistent eval helper. */
    sourceBackedHelper?: {
        name: string;
        sourceHash: string;
        declaredAction?: {
            toolCallId?: string;
            actionOrdinal: number;
            writtenCodeSha256: string;
        };
        declarationSpan: {
            start: number;
            end: number;
            line: number;
            column: number;
        };
    };
    /** Present only for compiler-registered authored source. */
    adaptation?: {
        label?: string;
        templateStart: number;
        templateEnd: number;
        expressions: string[];
        visibleBindings: string[];
        slotBindings: string[];
    };
    /** Source revision + AST span; stable for one source revision, not a user-facing name. */
    definitionId: string;
    /** Cooked template strings; interpolated values are inserted between them at invocation. */
    strings: string[];
    /** Exact template extent and ordered interpolation provenance; never executed during conversion. */
    templateSpan: SourceSpan;
    interpolations: {
        expression: string;
        sourceSpan: SourceSpan;
        type: TargetDescriptor | null;
        unsupported?: string;
    }[];
    /** Instruction text with interpolations shown as `${…}` for listings and traces. */
    instructions: string;
    parameters: {
        name: string;
        type: TargetDescriptor;
    }[];
    /**
     * Saved without parameters and never called where it was created (`const judge = nl<R>`...``, called in a later
     * eval): each call passes whatever arguments it has, typed from their values.
     */
    openParameters?: boolean;
    /** Source-checked fixed parameters; ordinary JS callback extras are ignored. */
    declaredParameters?: true;
    returns: TargetDescriptor;
    captures: CapturePlan[];
    /** `nl.with({ … })`: the captures are exactly the listed ones; no names are captured by mention. */
    explicitCaptures?: true;
    /** A soft function literal: the template is one model-written Neuralese block, this block ID. */
    softBody?: string;
    softBodyStopGradient?: true;
    softBodySourceOccurrence?: string;
    inheritedCodebaseRevision: string;
};
export type BindingClassifier = (declaration: ts.Declaration) => CapturePlan['source'] | undefined;
export type InlineAnalysisOptions = {
    /** Files whose declarations may be captured in addition to the analyzed file itself (eval scope declarations). */
    scopeFiles?: readonly ts.SourceFile[];
    authored?: boolean;
    /** Names never captured (the result slot, debug state, plumbing). */
    excludedNames?: ReadonlySet<string>;
    /** Reject type aliases that reach themselves through a function type (model-written eval code). */
    recursiveTypes?: boolean;
    classify?: BindingClassifier;
    sourceRevision?: string;
    codebaseRevision?: string;
    /** Display path used in spans and definition IDs. */
    displayPath?: (file: ts.SourceFile) => string;
    /**
     * `nl` is ambient rather than reserved by the source's language (a host's eval cell): declaring one's own `nl` is
     * ordinary lexical shadowing, not an error. Uses of that local are simply not natlang's.
     */
    allowShadowing?: boolean;
    /** Code outside any function may `await` (an eval cell, an ES module): a typed Neuralese readout there is not a sync readout. */
    topLevelAwait?: boolean;
};
/** The native state ID when a template is exactly one model-written body, `${__neuralese.body("nzs1_…")}`. */
export declare function softBodyOf(template: ts.TemplateLiteral): string | undefined;
/** The `nl.with(…)` call when a tagged template's tag is one. */
export declare function withCallOf(checker: ts.TypeChecker | undefined, tag: ts.Expression): ts.CallExpression | undefined;
/** Whether `type` (or a member of a union) carries the \`Untrusted<T>\` brand. */
export declare function isUntrustedType(checker: ts.TypeChecker, type: ts.Type): boolean;
/** The suffix capture call in `nl<Result>`instructions`.with({ capture })`. */
export declare function suffixWithCallOf(node: ts.TaggedTemplateExpression): ts.CallExpression | undefined;
/** The binding a `live(x)` capture names, when `expression` is one. */
export declare function liveTargetOf(checker: ts.TypeChecker | undefined, expression: ts.Expression): ts.Expression | undefined;
/** The intrinsic name (`nl`, `iterateOn`) a declaration stands for, via its `@natlangIntrinsic` tag. */
export declare function intrinsicOf(declaration: ts.Node | undefined): string | undefined;
/** Resolve an expression to the intrinsic it references, following import aliases. */
export declare function resolveIntrinsic(checker: ts.TypeChecker, expression: ts.Expression): string | undefined;
export declare function spanOf(node: ts.Node, displayPath?: (file: ts.SourceFile) => string, start?: number, end?: number): SourceSpan;
export declare function analyzeInlineLambdas(program: ts.Program, files: readonly ts.SourceFile[], options?: InlineAnalysisOptions): {
    plans: InlineLambdaPlan[];
    diagnostics: NatlangDiagnostic[];
    neuralese: NeuraleseLiteral[];
    readouts: NeuraleseReadout[];
    rebinds: InlineRebindSite[];
    instantiations: GenericInstantiation[];
};
export declare function isMutableBinding(declaration: ts.Declaration): boolean;
