import { type NativeModelIdentity } from '../native/neuralese-store.js';
import { type NativeStateConsumer } from '../native/neuralese.js';
/** A server's `/v1/neuralese/info`: the dialects it speaks, and the fields hosts read. Other fields are kept as sent. */
export type NeuraleseServerInfo = {
    dialects: string[];
    width?: number;
    dtype?: string;
    max_block_length?: number;
    capabilities?: string[];
} & Record<string, unknown>;
/**
 * Whether a server serves `capability` (spec/NEURALESE_PORT.md "Capabilities"): it is in the server's `capabilities`
 * list. A server that lists none serves none.
 */
export declare function serves(info: Record<string, unknown>, capability: string): boolean;
/**
 * The server's `/v1/neuralese/info`. A server without the endpoint is no Neuralese server: that fails with
 * `neuralese-unsupported-backend`.
 */
export declare function neuraleseServerInfo(endpoint: string, options?: {
    apiKey?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}): Promise<NeuraleseServerInfo>;
/**
 * Check that a server reads `dialect`; returns its info. A server that does not speak it fails with
 * `neuralese-dialect-mismatch` (values are never reused across dialects, NEURALESE_DIALECTS.md).
 */
export declare function checkNeuraleseReader(endpoint: string, dialect: string, options?: Parameters<typeof neuraleseServerInfo>[1]): Promise<NeuraleseServerInfo>;
/** Require that a live native reader is the exact student checkpoint selected for tune training/evaluation. */
export declare function requireNativeReaderIdentity(endpoint: string, expected: NativeModelIdentity, options?: Parameters<typeof neuraleseServerInfo>[1]): Promise<NativeStateConsumer>;
