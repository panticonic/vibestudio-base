/**
 * Transport to a native-state-capable model server (spec/NEURALESE_PORT.md, "Wire protocol"; S4 §3–4).
 *
 * The reference server is `python -m natlang_neuralese.serve` (training/neuralese). Requests are ordinary chat
 * completions whose message content and tool-call arguments carry native positional state references. The server
 * returns exact native-state artifacts and import receipts; projected value blocks are not a transport format.
 *
 * Replies stream when the server declares `stream: true` in `/v1/neuralese/info` (plans/STREAMING.md §1.2): text and
 * each written native state arrives as the turn's deltas (`ModelTurnOptions.onDelta`), and the final `x_natlang_message` is the
 * reply. A server that does not declare it gets whole requests.
 *
 * The driver keeps native state and named tensor custody in step across the runtime archive and model server.
 *
 * The runtime's store is also the archive that makes native artifacts outlive the server: `withRestoredNativeArtifacts` moves
 * exact native states and tensor artifacts runtime → server, and when the server reports an unknown native artifact it
 * re-uploads it from the archive and
 * retries once. A client names itself with `owner` (the `x-natlang-owner` header), so its pins and collections never
 * touch other sessions' artifacts.
 */
import { type ChatCompletionOptions, type HttpChatOptions } from './chat-completion.js';
import type { DecisionScorer, ModelTurn, ModelTurnOptions, ModelTurnRequest } from '../contracts.js';
import { type NeuraleseBlockMeta, type NativeStateArtifact, type NativeTensorArtifact, type NeuraleseStore } from '../native/neuralese-store.js';
type Json = Record<string, unknown>;
/** Header naming the owner of requests (a session or runtime ID): its pins and collections are its own (serve/store.py). */
export declare const OWNER_HEADER = "x-natlang-owner";
/** Whether `error` says the native server lost a named state or tensor artifact. */
export declare function isUnknownNativeArtifactError(error: unknown): boolean;
/**
 * Upload to the server every native artifact of `ids` it lacks, from `archive` (the runtime's content-addressed store) or the
 * registered constants. Returns the IDs that neither has; the caller reports them in its own terms.
 */
export declare function restoreNativeArtifacts(remote: NeuraleseStore, archive: Pick<NeuraleseStore, 'getNativeState' | 'getNativeTensorArtifact'> | undefined, ids: Iterable<string>): Promise<string[]>;
/**
 * Run a server request that reads `ids`, with those native artifacts on the server first. `known` caches IDs already uploaded
 * (they are not checked again); when the server still answers `neuralese-unknown-native-*` (it restarted or collected
 * them since), every block is checked and restored from `archive`, and the request runs once more.
 */
export declare function withRestoredNativeArtifacts<T>(remote: NeuraleseStore, archive: NeuraleseStore | undefined, ids: readonly string[], run: () => Promise<T>, known?: Set<string>): Promise<T>;
/** Native artifact endpoints as a store. The server has no projected block API. */
export declare class HttpNeuraleseStore implements NeuraleseStore {
    private readonly headers;
    private readonly base;
    constructor(endpoint: string, headers?: Record<string, string>);
    private request;
    putNativeState(artifact: Omit<NativeStateArtifact, 'id'>): Promise<NativeStateArtifact>;
    getNativeState(id: string): Promise<NativeStateArtifact | undefined>;
    hasNativeState(id: string): Promise<boolean>;
    putNativeTensorArtifact(artifact: Omit<NativeTensorArtifact, 'id'>): Promise<NativeTensorArtifact>;
    getNativeTensorArtifact(id: string): Promise<NativeTensorArtifact | undefined>;
    hasNativeTensorArtifact(id: string): Promise<boolean>;
    meta(id: string): Promise<NeuraleseBlockMeta | undefined>;
    has(id: string): Promise<boolean>;
    pin(id: string): Promise<void>;
    unpin(id: string): Promise<void>;
    collect(referenced: ReadonlySet<string>): Promise<string[]>;
}
export type NeuraleseServerOptions = Omit<HttpChatOptions, 'stream'> & Pick<ChatCompletionOptions, 'onExchange' | 'onTurn'> & {
    /** The runtime's store: native state and tensor artifacts are uploaded and restored after a server restart. */
    store?: NeuraleseStore;
    /** This session's or runtime's ID on the server (`x-natlang-owner`): native artifact pins and collections are scoped to it. */
    owner?: string;
    /** Explicit raw-state exchange between actors of the exact same native base. */
    nativeStateModes?: Record<string, 'same-base-adapter-state'>;
    /** Extra request fields. */
    request?: Json;
};
/** Native artifacts carried by parts or the runtime's private-use transcript marker. */
export declare function requestNativeStateIds(messages: readonly unknown[]): string[];
/** One native-state import at its request location, retaining its declared writer occurrence when present. */
export type NativeStateRequestBinding = {
    id: string;
    source_occurrence?: string;
    path: string;
};
/**
 * Native IDs alone are enough to restore artifacts, but not to bind execution
 * graph edges: repeated same-ID imports can have distinct writer occurrences.
 * Keep every occurrence and a stable request path for graph consumers.
 */
export declare function requestNativeStateBindings(messages: readonly unknown[]): NativeStateRequestBinding[];
export declare function restoreNativeStates(remote: HttpNeuraleseStore, archive: NeuraleseStore | undefined, ids: readonly string[], known?: Set<string>, all?: boolean): Promise<void>;
/** Archive the same exact reply closure for live turns and saved-turn replay. */
export declare function archiveNeuraleseReplyArtifacts(reply: Json, remote: NeuraleseStore, store: NeuraleseStore | undefined, references?: readonly unknown[]): Promise<{
    native: Set<string>;
}>;
/** A model-turn driver for a Neuralese server. It advertises `neuralese: true`. */
export declare function neuraleseServerModelTurn(options: NeuraleseServerOptions): ((request: ModelTurnRequest, signal?: AbortSignal, options?: ModelTurnOptions) => Promise<ModelTurn>) & {
    neuralese: true;
    artifacts: HttpNeuraleseStore;
    decide: DecisionScorer;
    neuraleseRuntime: () => Promise<import('../native/neuralese.js').NeuraleseRuntimeOptions>;
};
export {};
