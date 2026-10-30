/** The refined slots (`Is<T, "predicate">`) of a function signature, for `natlang check` (plans/REFINEMENT_TYPES.md section 6). */
import { TypeEnv, type Type } from '../native/types.js';
export type RefinedSlot = {
    source: string;
    function: string;
    slot: string;
    predicate: string;
};
/** Every predicate a value of `type` must satisfy, by slot path (`return`, `body`, `return.items[].quote`). */
export declare function refinedPredicates(type: Type, env: TypeEnv, path: string, seen?: Set<string>): {
    slot: string;
    predicate: string;
}[];
/** The refined slots of a function given its argument and result type text and its type aliases. */
export declare function refinedSlotsOf(source: string, name: string, args: Record<string, string>, returns: string, types: Record<string, string>): RefinedSlot[];
