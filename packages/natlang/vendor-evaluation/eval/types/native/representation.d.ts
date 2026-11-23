/** Which instance of a representation-generic result a call runs. `dialect` absent: the declared (or default) one. */
export type Representation = {
    kind: 'crisp';
} | {
    kind: 'neuralese';
    dialect?: string;
};
export declare const CRISP: Representation;
/** A declared representation-generic result: `name` stands for `crisp` or `neuralese` (= `Neuralese<crisp, dialect>`). */
export type GenericResult = {
    name: string;
    constraint: string;
    crisp: string;
    neuralese: string;
    dialect: string;
};
/**
 * The generic result `generic` declares for `returns`; undefined when the function declares none. Throws an Error
 * whose message says what to write instead.
 */
export declare function genericResult(generic: Record<string, string> | undefined, returns: string): GenericResult | undefined;
/** How a representation reads in messages: `string`, `Neuralese<string>`, `Neuralese<string, "nd:x@1">`. */
export declare function representationType(crisp: string, representation: Representation): string;
/** A representation given by a host (`invokeAt`), checked. */
export declare function checkRepresentation(value: unknown): Representation;
