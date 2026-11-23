/** A managed server's settings: a profile's `local` object (model/config.ts) carries these and adds what selects the model. */
export type LocalServerSettings = {
    contextTokens?: number;
    gpuLayers?: number;
    parallel?: number;
    cacheRamMiB?: number;
    args?: string[];
    memoryBudgetMiB?: number;
    kvBytesPerToken?: number;
};
export type SlotPlan = {
    budgetSource: 'configured-parallel' | 'memoryBudgetMiB' | 'NATLANG_MODEL_MEMORY_BUDGET_MIB' | 'default';
    slots: number;
    contextPerSlot: number;
    totalContext: number;
    source: 'configured' | 'memory';
    budgetBytes: number | null;
    modelBytes: number;
    kvBytesPerToken: number;
    formula: string;
};
export declare const DEFAULT_KV_BYTES_PER_TOKEN = 65536;
export declare const DEFAULT_MEMORY_FRACTION = 0.5;
export declare const DEFAULT_MAX_SLOTS = 8;
/** The default KV budget never exceeds this, so a server started from momentary free memory cannot crowd out later jobs. */
export declare const DEFAULT_KV_BUDGET_CAP_BYTES: number;
export declare function planServerSlots(input: {
    local?: LocalServerSettings;
    modelBytes: number;
    defaultContextTokens: number;
    /** The served model's measured figure (model-catalog.ts), used before the generic default. */
    defaultKvBytesPerToken?: number;
    availableMemoryBytes?: number;
    environment?: NodeJS.ProcessEnv;
}): SlotPlan;
