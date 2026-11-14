/**
 * The kernel call contract of docs/dolt-redesign.md §7.5.1, as types. The
 * kernel (`EvalKernel`) implements it; a session entity relays it. Types
 * only: nothing here is bundled into either class.
 */

/** Who the hosting entity is acting for. */
export type KernelCaller =
  | { readonly kind: "host" }
  | { readonly kind: "session"; readonly admissionNonce: string };

export interface KernelStartAck {
  readonly runId: string;
  readonly runDigest: string;
  readonly scopeInputRevision?: string;
  readonly status: string;
  readonly existing: boolean;
}

/** What `await` and `get` return: the run's status and, once terminal, its result. */
export interface KernelRunSnapshot {
  readonly status: string;
  readonly result?: unknown;
  readonly progress?: unknown;
  readonly checkpoint?: unknown;
  readonly activity?: unknown;
}

export interface KernelEventPage {
  readonly events: ReadonlyArray<{
    readonly sequence: number;
    readonly at: number;
    readonly kind: string;
    readonly payload: unknown;
  }>;
  readonly next: number;
  readonly hasMore: boolean;
}

/** `await` blocks at most this long (default and cap, milliseconds). */
export const KERNEL_AWAIT_DEFAULT_MS = 30_000;
export const KERNEL_AWAIT_MAX_MS = 120_000;
