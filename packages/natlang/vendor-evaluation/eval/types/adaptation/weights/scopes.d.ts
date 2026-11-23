/**
 * Compile the lexical adapter-scope tree of a program (plans/HIERARCHICAL_LORA_TUNING.md §3.1).
 *
 * The context DAG has no unique parent, so the tree is declared over bound definitions: the program root, one folder
 * node per directory on a definition's source path (author-declared tree roots become `tree` nodes), and one lambda
 * node per named definition or persistent inline site. Two aliases of one bound callable resolve to the same binding
 * because resolution keys on the callee's definition, not on the path a caller took.
 */
import type { ProgramDescriptor } from '../types.js';
import type { ScopeNode, WeightBindingEntry } from './manifest.js';
export type ScopeOptions = {
    /** Directories (relative to the program root, `/`-separated) that root their own tree level. */
    readonly treeRoots?: readonly string[];
    /** Persistent site IDs by current component key (tune/sites.ts); a component without one is its own site. */
    readonly sites?: Readonly<Record<string, string>>;
};
export declare const ROOT_NODE = "tree:";
/** The semantic hash a binding's adapters were trained against: its baseline instructions and frozen contract. */
export declare function bindingSemanticHash(component: ProgramDescriptor['components'][number]): string;
export declare function compileScopeTree(program: ProgramDescriptor, options?: ScopeOptions): {
    tree: ScopeNode[];
    bindings: WeightBindingEntry[];
};
