/**
 * Native neuralese archives: a safetensors container whose metadata key `natlang` holds a JSON header of typed
 * named exports and an inventory of native state/tensor artifacts, each named by its content ID.
 *
 * This module is the codec and the export loader. It knows nothing of callables: soft-function exports are returned
 * as `NzSoftFunctionSpec` values, which the runtime turns into callables (runtime/contexts.ts).
 */
import { type NativeTensorArtifact, type NativeStateArtifact, type NeuraleseStore } from './neuralese-store.js';
export declare const NZ_FORMAT = "natlang.neuralese-file/1";
/** Errors with the codes the specification names. */
export declare class NzFileError extends Error {
    readonly code: 'neuralese-block-integrity' | 'neuralese-file-format' | 'neuralese-file-type' | 'neuralese-dialect-mismatch' | 'neuralese-ref-cycle' | 'neuralese-unknown-block' | 'neuralese-live-capture-save';
    constructor(code: 'neuralese-block-integrity' | 'neuralese-file-format' | 'neuralese-file-type' | 'neuralese-dialect-mismatch' | 'neuralese-ref-cycle' | 'neuralese-unknown-block' | 'neuralese-live-capture-save', message: string);
}
export type NzSkill = {
    name: string;
    description: string;
    body: string;
    natlang?: Record<string, unknown>;
};
export type NzHeader = {
    format: typeof NZ_FORMAT;
    dialect: string;
    types?: string;
    exports: Record<string, {
        type: string;
        value: unknown;
        description?: string;
    }>;
    native_states?: Record<string, {
        bytes: number;
    }>;
    native_tensors?: Record<string, {
        bytes: number;
    }>;
    skill?: NzSkill;
    provenance?: Record<string, unknown>;
};
/** A soft function as stored: its type, body block and snapshot captures (already resolved to values). */
export type NzSoftFunctionSpec = {
    readonly kind: 'soft-function';
    readonly type: string;
    readonly body: string;
    readonly body_stop_gradient?: true;
    readonly body_source_occurrence?: string;
    readonly captures: Readonly<Record<string, unknown>>;
};
export declare const isSoftFunctionSpec: (value: unknown) => value is NzSoftFunctionSpec;
/** JSON with sorted keys, so equal content gives equal bytes. */
export declare function canonicalJson(value: unknown): string;
/** Encode native artifacts as safetensors bytes. Tensors are ordered by ID; offsets are contiguous. */
export declare function encodeNz(header: NzHeader, artifacts: ReadonlyMap<string, Uint8Array>): Uint8Array;
/** Decode a native artifact archive, checking every content address and dependency. */
export declare function decodeNz(bytes: Uint8Array): {
    header: NzHeader;
    nativeStates: Map<string, NativeStateArtifact>;
    nativeTensors: Map<string, NativeTensorArtifact>;
};
export type LoadedNz = {
    header: NzHeader;
    /** Export values: plain data, native artifact references and `NzSoftFunctionSpec`s; `$ref`s resolved. */
    exports: Record<string, unknown>;
    /** Natlang type of every export. */
    types: Record<string, string>;
    nativeStates: Map<string, NativeStateArtifact>;
    nativeTensors: Map<string, NativeTensorArtifact>;
};
/** Resolve another file's export for a cross-file `$ref` (`./other.nz#name`). */
export type NzResolver = (path: string) => LoadedNz;
/**
 * Load a native archive: resolve `$ref`s (a DAG), check every export against its declared type and artifact dialect,
 * and import the complete native dependency bundle when a store is given.
 */
export declare function loadNz(bytes: Uint8Array, options?: {
    store?: NeuraleseStore;
    resolve?: NzResolver;
}): Promise<LoadedNz>;
/** Record native artifacts loaded without a store (compiled imports, companion folders) for runtimes to adopt. */
export declare function registerImportedNativeArtifacts(nativeStates?: Iterable<NativeStateArtifact>, nativeTensors?: Iterable<NativeTensorArtifact>): void;
export declare function importedNativeArtifacts(): {
    nativeStates: ReadonlyMap<string, NativeStateArtifact>;
    nativeTensors: ReadonlyMap<string, NativeTensorArtifact>;
};
/** Put every imported native artifact dependency a store lacks into it. */
export declare function adoptImportedNativeArtifacts(store: Pick<NeuraleseStore, 'has' | 'getNativeState' | 'getNativeTensorArtifact' | 'putNativeState' | 'putNativeTensorArtifact'>): Promise<void>;
export declare function loadNzSync(bytes: Uint8Array, resolve?: NzResolver): LoadedNz;
/** A value to save: data, `NeuraleseRef`s, and soft functions (as specs; live captures are refused by the caller). */
export type NzSaveExport = {
    type: string;
    value: unknown;
    description?: string;
};
/**
 * Build an archive from export values and the complete native artifact dependency closure they reference.
 */
export declare function saveNz(exports: Record<string, NzSaveExport>, options: {
    store: NeuraleseStore;
    dialect: string;
    types?: string;
    skill?: NzSkill;
    provenance?: Record<string, unknown>;
}): Promise<Uint8Array>;
/**
 * TypeScript declarations for a `.nz` file, read by the checker as `name.d.nz.ts`. Natlang types are written as
 * TypeScript through `typeText` (the compiler's natlang → TypeScript mapping); `Neuralese` is a global intrinsic type.
 */
export declare function nzDeclaration(header: NzHeader, source: string, typeText: (text: string, known: ReadonlySet<string>) => string): string;
/** Base64 of bytes, for embedding a file in generated module code. */
export declare function toBase64(bytes: Uint8Array): string;
export declare function fromBase64(text: string): Uint8Array;
