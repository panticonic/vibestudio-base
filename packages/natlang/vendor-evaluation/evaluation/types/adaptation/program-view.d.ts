import type { AdaptationBinding, ComponentValue, ProgramDescriptor } from './types.js';
import type { ItemRecord } from '../runtime/loader.js';
import type { InlineLambdaPlan } from '../compiler/inline.js';
import { type NativeProgramGuidance } from '../guidance/program.js';
/** Frontmatter is copied byte for byte. */
export declare function replaceNamedBody(source: string, body: string): string;
/** Escapes only static segments; original interpolation expression AST text is retained. */
export declare function templateSource(segments: readonly string[], expressions: readonly string[]): string;
export declare class ProgramView {
    readonly program?: ProgramDescriptor | undefined;
    readonly binding?: (AdaptationBinding | null) | undefined;
    private readonly revisions;
    private revision;
    private cache;
    private originals;
    private inlineRevisions;
    component(definitionId: string): import("./types.js").ComponentDescriptor | undefined;
    inlineRevision(plan: InlineLambdaPlan): InlineLambdaPlan;
    original<T extends ItemRecord>(record: T): T;
    constructor(program?: ProgramDescriptor | undefined, binding?: (AdaptationBinding | null) | undefined);
    value(definitionId: string, owner?: string): ComponentValue | undefined;
    guidance(): string;
    /** Stored native guidance is encoded by the runtime for its exact current student checkpoint. */
    nativeGuidance(): NativeProgramGuidance | undefined;
    source(path: string, fallback: string): string;
    record<T extends ItemRecord>(record: T): T;
    tree(records: Record<string, ItemRecord>): Record<string, ItemRecord>;
    patched(path: string): boolean;
    get revisionId(): number;
    commit(record: ItemRecord, expectedRevision: number, inline?: {
        original: InlineLambdaPlan[];
        previous: InlineLambdaPlan[];
        current: InlineLambdaPlan[];
    }): number;
    provenance(definitionId: string, owner?: string): Record<string, unknown>;
}
