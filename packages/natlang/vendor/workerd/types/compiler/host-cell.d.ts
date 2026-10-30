import { type LibProvider } from './host.js';
import { type InlineLambdaPlan, type NatlangDiagnostic } from './inline.js';
import type { ProgramDescriptor } from '../adaptation/types.js';
import { type SourceFiles } from '../runtime/loader.js';
export type HostCellOptions = {
    /** Name the cell goes by in diagnostics and plan spans (default `cell.ts`, `cell.tsx` with `jsx`). */
    fileName?: string;
    /** The cell is TSX: parse JSX. */
    jsx?: boolean;
    /**
     * Declaration text (a global `.d.ts`, no top-level `import`/`export`) for the host's ambient free variables, with the
     * current contents of `scope` and the like (see `declarationsForValues`). They give inference its types. They are not
     * captured by mentioning their names in an instruction: authority is passed explicitly, as an argument or `nl.with`.
     * Names the declarations leave out, and modules the cell imports, are `any`.
     */
    ambientDeclarations: string;
    /** Typed host services, declared by name in the same ambient scope (the declarations of a program descriptor). */
    services?: ProgramDescriptor['services'];
    /** The callable folder every `nl` in the cell is bound to (a `natlang.d` directory), embedded in each site as in project builds. */
    context?: {
        directory: string;
        files: SourceFiles;
    };
    /**
     * The host's scope holds Neuralese values: analyze every cell, so their opacity is checked and typed readouts
     * (string coercion, `read`, `JSON.stringify`, ...) are lowered even where the cell never writes `nl`.
     */
    neuralese?: boolean;
    /** Identity of this cell's source revision, mixed into the plans' definition IDs (default: a hash of the source). */
    revision?: string;
    /** TypeScript library declarations, for hosts without a TypeScript install on disk. */
    libs?: LibProvider;
};
export type HostCellResult = {
    /**
     * The cell with each `nl` expression lowered; the cell unchanged when it uses no ambient `nl` or has an error
     * diagnostic.
     */
    code: string;
    /** One plan per lowered site, with spans in the original cell. */
    plans: InlineLambdaPlan[];
    /** Syntax errors and natlang errors, with 1-based lines and columns in the original cell. */
    diagnostics: NatlangDiagnostic[];
    /** The cell refers to the ambient `nl` (a local declaration of that name is not it). */
    usesNl: boolean;
};
export declare function lowerHostCell(source: string, options: HostCellOptions): HostCellResult;
export type ValueDeclarationLimits = {
    /** List items read to infer an item type (default 64). */
    maxItems?: number;
    /** Fields of one record read (default 64). */
    maxFields?: number;
    /** Nesting depth read; deeper values are `unknown[]` or `Record<string, unknown>` (default 8). */
    maxDepth?: number;
};
/**
 * Ambient declarations (`declare const name: Type;`) for the current values of host bindings, to pass as
 * `HostCellOptions.ambientDeclarations`. Types are the ones natlang gives a scope value when it opens a call
 * (`inferValueType`): records by their fields, lists by the union of their items', large keyed objects as
 * `Record<string, T>`. Large and deep values are read to bounded size, so the declaration stays short and a cyclic value
 * terminates. Functions and live objects are declared as natlang declares live values: functions callable with any
 * arguments, built-ins (`Date`, `Map`, ...) by name, other objects `any`; a record holding some keeps the types of its
 * other fields. Names that are not identifiers are left out.
 */
export declare function declarationsForValues(values: Record<string, unknown>, options?: ValueDeclarationLimits): string;
