/**
 * Stock GGUF models the managed llama.cpp backend downloads, verifies and serves without any setup beyond
 * `natlang setup`. While our own LFM3 checkpoints train, the default is the stock instruction model
 * LiquidAI/LFM3-1.7B (13/16 on the held-v3 cadence subset as a base model,
 * plans/neuralese/LFM3_1P7B_BASE_EVAL_20261027.md). A profile selects another quantization with `local.stock`.
 * Files are pinned to one repository revision and checked by size and SHA-256.
 */
export type LocalModelRelease = {
    readonly id: string;
    readonly label: string;
    readonly family: string;
    readonly file: string;
    readonly quant: string;
    readonly bytes: number;
    readonly sha256: string;
    /** Default context per server slot. */
    readonly contextTokens: number;
    /** Measured context memory per token (KV, sliding-window and recurrent state), which sizes the server's slots. */
    readonly kvBytesPerToken: number;
    readonly downloadUrl: string;
    /** Chat template under models/templates/ (packaged as model-assets/); the GGUF's own template, extracted verbatim. */
    readonly template: string;
    readonly source: {
        readonly repository: string;
        readonly revision: string;
    };
    /** Request fields the model is served with; a profile's request overrides them. */
    readonly request?: Readonly<Record<string, unknown>>;
};
export declare const STOCK_MODELS: readonly LocalModelRelease[];
/** The managed local default: near-lossless 8-bit LFM3 1.7B (1.8 GB). */
export declare const DEFAULT_LOCAL_MODEL: LocalModelRelease;
export declare function stockModel(id: string): LocalModelRelease;
