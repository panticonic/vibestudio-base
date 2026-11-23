import { type AdaptationArtifact, type ComponentValue } from './types.js';
export declare class AdaptationError extends Error {
    constructor(message: string);
}
/** JSON recursive descent with duplicate member detection, including escaped spellings. */
export declare function parseStrictJSON(text: string): unknown;
export declare function object(value: unknown, keys: readonly string[], path: string): Record<string, unknown>;
export declare function nonempty(value: unknown, path: string): string;
export declare function strings(value: unknown, path: string): readonly string[];
export declare function validateValue(value: unknown): ComponentValue;
export declare function artifactDigest(artifact: Omit<AdaptationArtifact, 'digest'> | AdaptationArtifact): string;
export declare function validateAdaptation(value: unknown): AdaptationArtifact;
export declare function parseAdaptation(text: string): AdaptationArtifact;
