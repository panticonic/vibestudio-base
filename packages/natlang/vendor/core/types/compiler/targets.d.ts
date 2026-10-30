import ts from 'typescript';
/** Runtime contract for a value that is checked as a live host object rather than portable data. */
export type HostContract = {
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
    kind: 'folder';
} | {
    kind: 'file';
};
/**
 * A resolved TypeScript target. `natlang` is the portable type text understood by the
 * interpreter's checker; when absent, `host` gives the live-object contract.
 */
export type TargetDescriptor = {
    text: string;
    natlang?: string;
    aliases: Record<string, string>;
    host?: HostContract;
};
/** Parse one exact TypeScript primitive literal descriptor; reject unions and non-primitive literals. */
export declare function portablePrimitiveLiteral(descriptor: string): {
    type: 'string' | 'number' | 'boolean';
    value: string | number | boolean;
} | undefined;
export declare class TargetError extends Error {
}
/** Unwrap `Promise<T>` (and unions containing promises) to the awaited value type. */
export declare function awaitedType(checker: ts.TypeChecker, type: ts.Type): {
    type: ts.Type;
    promised: boolean;
};
export declare function isPromiseLike(checker: ts.TypeChecker, type: ts.Type): boolean;
/** Convert a checked TypeScript type into a target descriptor, or throw a TargetError explaining why not. */
export declare function describeTarget(program: ts.Program, checker: ts.TypeChecker, type: ts.Type, options?: {
    allowHost?: boolean;
    location?: ts.Node;
}): TargetDescriptor;
