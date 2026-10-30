/** Native port of natlang's structural type grammar and fit relation. */
export type Type = {
    kind: 'prim';
    name: 'string' | 'number' | 'boolean' | 'null' | 'Blob' | 'Folder' | 'FileHandle' | 'unknown';
} | {
    kind: 'lit';
    value: string | number;
} | {
    kind: 'record';
    fields: {
        name: string;
        type: Type;
        optional: boolean;
    }[];
} | {
    kind: 'list';
    element: Type;
} | {
    kind: 'dict';
    element: Type;
} | {
    kind: 'union';
    members: Type[];
} | {
    kind: 'name';
    name: string;
} | {
    kind: 'lambda';
    params: Extract<Type, {
        kind: 'record';
    }>;
    returns: Type;
}
/** A live host object checked by contract rather than copied as data. `name` is its TypeScript text. */
 | {
    kind: 'host';
    name: string;
    contract: HostCheck;
}
/** A soft value of `element` in a Neuralese dialect: an opaque reference to a stored block of vectors. */
 | {
    kind: 'neuralese';
    element: Type;
    dialect: string;
}
/** `Is<T, "predicate">`: values of `base` that a reader can judge to satisfy the natural-language `predicate`
 * (plans/REFINEMENT_TYPES.md). Structurally it is `base`; the predicate is checked where a value enters the slot. */
 | {
    kind: 'refined';
    base: Type;
    predicate: string;
}
/** `A & B`: resolves (TypeEnv.resolve) to one merged record, dictionary or the common type. Object types written
 * inline merge when parsed; an alias among the members merges when it is resolved. */
 | {
    kind: 'intersection';
    members: Type[];
}
/** `T['field']`: the type of a field of a record, or the element of a dictionary, found when it is resolved. */
 | {
    kind: 'index';
    base: Type;
    key: string;
}
/** `Untrusted<T>`: a `T` that came from outside the program. Structurally `base`; the model-facing renderer always
 * shows it as a quoted data block (native/untrusted.ts) and it never enters instruction text (plans/REFINEMENT_TYPES.md). */
 | {
    kind: 'untrusted';
    base: Type;
};
/** The dialect a `Neuralese<T>` without a second argument names; a program's configuration binds it. */
export declare const DEFAULT_DIALECT = "DefaultDialect";
/**
 * How a runtime's type checks see dialects (DECISIONS.md 2026-10-09, "dialects are static facts"). `dialect` is the
 * runtime's reader dialect, which `DefaultDialect` stands for; null for a text-only runtime, where `DefaultDialect`
 * stays unbound. `blockDialect` is the dialect a stored block was written in, when the store knows it without I/O.
 */
export type DialectBinding = {
    readonly dialect: string | null;
    blockDialect?(id: string): string | undefined;
    nativeDefaultCompatible?(id: string, source: string, target: string): boolean;
};
/** `NativeAdapter` is an opaque reference to an archived nnt1 coefficient artifact. */
export declare const NATIVE_ADAPTER_TYPE: Type;
/** `NativeTensor` is an opaque ref to one archived non-coefficient nnt1 tensor artifact. */
export declare const NATIVE_TENSOR_TYPE: Type;
/** Runtime check for a live host value. */
export type HostCheck = {
    kind: 'tag';
    tag: string;
} | {
    kind: 'class';
    name: string;
} | {
    kind: 'shape';
    members: string[];
} | {
    kind: 'function';
} | {
    kind: 'any';
};
/** Check a live value against a host contract. Built-ins use their internal tag, which works across realms. */
export declare function checkHost(value: unknown, contract: HostCheck, classes?: ReadonlyMap<string, Function>): boolean;
export declare class TypeSyntaxError extends Error {
}
/** A predicate with its whitespace collapsed: two predicates are the same when their normalized texts are equal. */
export declare const normalizePredicate: (predicate: string) => string;
export declare function parseType(text: string): Type;
export declare function formatType(type: Type): string;
export declare class TypeEnv {
    readonly names: Record<string, Type>;
    readonly parent?: TypeEnv | undefined;
    /** Constructors used to check `class` host contracts; inherited by child environments. */
    classes?: ReadonlyMap<string, Function>;
    /** The runtime's dialect binding; inherited by child environments. Without one, `DefaultDialect` is unbound. */
    dialects?: DialectBinding;
    constructor(names?: Record<string, Type>, parent?: TypeEnv | undefined);
    /**
     * Reject an alias that reaches itself through a function type (`type-recursive-function`): self-application
     * would make recursion expressible without a recursive definition. Recursive data types stay allowed.
     */
    private checkRecursiveFunction;
    child(names: Record<string, Type>): TypeEnv;
    lookup(name: string): Type | undefined;
    /** The dialect a type's dialect name means here: `DefaultDialect` is the bound reader dialect, when there is one. */
    dialect(name: string): string;
    resolve(type: Type): Type;
    checkNames(type: Type): void;
    private resolveQuiet;
}
export declare function fitsType(source: Type, target: Type, env?: TypeEnv, seen?: Set<string>): boolean;
/** The predicates of a (possibly nested) refinement, outermost last, and the unrefined type beneath them. */
export declare function refinementChain(type: Type, env: TypeEnv): {
    base: Type;
    predicates: string[];
};
/** Whether `type` mentions a refinement anywhere (named types followed once each). */
export declare function containsRefinement(type: Type, env: TypeEnv, seen?: Set<string>): boolean;
/**
 * The check obligations of putting a value of `source` into `target`: the predicates of refined target positions that
 * the source does not already carry, by path. null when `source` does not fit `target` at all.
 */
export declare function fitObligations(source: Type, target: Type, env?: TypeEnv, path?: string): {
    path: string;
    predicate: string;
}[] | null;
/**
 * Crisp checkers for refinement predicates, by normalized predicate text. A checker that returns a boolean decides;
 * `undefined` defers to the judge (plans/REFINEMENT_TYPES.md section 3). Register more with `refinements[predicate] = fn`;
 * a runtime's `refinements.crisp` setting is consulted before this table.
 */
export declare const refinements: Record<string, (value: unknown) => boolean | undefined>;
