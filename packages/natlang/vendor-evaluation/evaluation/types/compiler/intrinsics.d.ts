/**
 * Declarations for the natlang TypeScript surface.
 *
 * `nl` and `iterateOn` are ordinary TypeScript declarations whose extra meaning is
 * supplied by the natlang compiler. The compiler recognizes them by the
 * `@natlangIntrinsic` JSDoc tag on the resolved declaration, never by spelling alone.
 */
/** Version of generated lowering. A runtime refuses output from another major version. */
export declare const NATLANG_COMPILE_VERSION: 8;
/** Shared type contract for free `iterateOn` and eval's normalized `fn.iterateOn` analysis form. */
export declare const ITERATE_ON_SIGNATURE = "<T, A extends unknown[]>(step: (state: T, ...args: A) => T | Promise<T>, initial: T, ...args: A): Iteration<T>";
/** Names that cannot be used as child attributes of a natlang callable object. */
export declare const RESERVED_CALLABLE_PROPERTIES: ReadonlySet<string>;
/** The camelCase identifier a file or function name with separators stands for: `read-limits` is `readLimits`. */
export declare const camelCaseName: (name: string) => string;
/** One sentence for a callable name that is not a JavaScript identifier, naming the identifier to use. */
export declare const invalidNameMessage: (name: string) => string;
/** One sentence for a callable name that is a function property, naming a rename. */
export declare const reservedNameMessage: (name: string, what?: string) => string;
/** Exact ambient declaration for the compiler-provided Neuralese type, also shown by read_code("Neuralese"). */
export declare const NEURALESE_TYPE_DECLARATION: string;
export declare const NEURALESE_TYPE_DOCUMENTATION: string;
export declare const INTRINSICS_GLOBAL_DTS: string;
/** Module declaration text for packages that export the natlang surface. */
export declare const INTRINSICS_MODULE_DTS: string;
export declare const INTRINSICS_FILE = "/__natlang__/intrinsics.d.ts";
/** Module form, resolved for `@natlang/*` imports in virtual programs. */
export declare const SURFACE_MODULE_FILE = "/__natlang__/surface.d.ts";
