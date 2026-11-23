import { type Type, type TypeEnv } from './types.js';
/** A type expanded for an editor: aliases inlined (named by `alias`), record fields with their `types.ts` doc comments,
 * and a recursive or unknown name left as `{ kind: 'name' }` for the general value editor. */
export type ExpandedType = Type & {
    alias?: string;
};
/** `type` with aliases inlined for an editor; a name seen again on its own path (recursion) stays a name. */
export declare function expandType(type: Type, env: TypeEnv, docs?: Record<string, Record<string, string>>, path?: string[]): ExpandedType;
