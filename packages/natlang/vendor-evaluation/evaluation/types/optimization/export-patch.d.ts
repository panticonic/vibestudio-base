export { loadAdaptation } from '../adaptation/node.js';
import type { AdaptationArtifact, ProgramDescriptor, ExecutorIdentity } from '../adaptation/types.js';
import type { PreparedSuite } from '../evaluation/types.js';
import type { ModelDriver } from '../runtime/runtime.js';
export declare function exportAdaptationPatch(artifact: AdaptationArtifact, program: ProgramDescriptor, executor: ExecutorIdentity, root: string): {
    patch: string;
    manifest: readonly {
        path: string;
        original: string;
        updated: string;
    }[];
    guidance?: string;
};
/** Explicit contract mapping plus new regression evidence; executor/source changes issue a new artifact. */
export declare function revalidateAdaptation(old: AdaptationArtifact, prepared: PreparedSuite, driver: ModelDriver, mapping?: Readonly<Record<string, string>>, options?: {
    judge?: ModelDriver;
    signal?: AbortSignal;
}): Promise<AdaptationArtifact>;
