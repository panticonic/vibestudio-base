declare const DERIVATION = "natlang.native-state-derivation/1";
export type NativeStateOptimizationDerivation = {
    schema: typeof DERIVATION;
    kind: 'optimizer';
    origin_state_ids: string[];
    parent_state_id: string;
    gradient_id: string;
    update_artifact_id: string;
    program_id: string | null;
    optimizer_state_parent_id: string | null;
    step: number;
    optimizer: Record<string, string>;
    updated_tensor_names: string[];
    arithmetic: Record<string, string>;
};
export type NativeStateSemanticDerivation = {
    schema: typeof DERIVATION;
    kind: 'semantic-encode' | 'semantic-adapt';
    origin_state_ids: string[];
    parent_state_id: string;
    adapter_sha256: string;
    source_native_identity: Record<string, string>;
    target_native_identity: Record<string, string>;
    source_adapter_sha256?: string;
    training_execution?: {
        schema: 'natlang.native-semantic-policy-execution/1';
        parent_checkpoint_sha256: string;
        parent_adapter_sha256: string;
        behavior_adapter_sha256: string;
        parent_step: number;
        step: number;
    };
};
export type NativeStateDerivation = NativeStateOptimizationDerivation | NativeStateSemanticDerivation;
export declare function validateNativeOptimizerBinding(value: Record<string, string>): void;
export declare function nativeOptimizerOptions(value: Record<string, string>): Record<string, string | number>;
export declare function validateNativeStateDerivation(value: NativeStateDerivation | undefined): void;
export declare function nativeStateDerivationDependencies(value: NativeStateDerivation | undefined): string[];
export declare function validateNativeDerivativeArtifact(value: Record<string, unknown>): void;
/** The target of a meta-gradient can differ from the actors evaluated by its outer loss. */
export declare function validateNativeDerivativeTarget(metadata: {
    kind: string;
    native_identity: unknown;
    source_artifact_id: string | null;
    provenance: Record<string, unknown>;
}, tensors: Record<string, unknown>): boolean;
export type NativeFunctionalActor = {
    schema: 'natlang.native-functional-actor/1';
    base_native_identity: unknown;
    parameter_values: {
        id: string;
        names: string[];
    }[];
    uniform_adapters: {
        id: string;
        scale_hex: string;
    }[];
    invocation_adapters: Record<string, {
        id: string;
        scale_hex: string;
    }[]> | null;
    arithmetic: Record<string, unknown>;
};
export declare function validateNativeFunctionalActor(metadata: {
    native_identity: unknown;
    provenance: Record<string, unknown>;
}, canonical: (value: unknown) => string): NativeFunctionalActor | undefined;
/** Immutable readout inputs of a declared inline objective. */
export declare function nativeQueryReadoutDependencies(value: unknown): string[];
export {};
