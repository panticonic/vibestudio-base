/**
 * Connection retry policy for the session's owned connect loop.
 *
 * A transient failure (cold service work, a dropped transport) heals itself,
 * so the loop retries it with a bounded backoff. Authoritative access and
 * application failures are terminal: they are surfaced and never looped on.
 */

export function isTransientConnectionFailure(error: unknown): boolean {
  const kind =
    typeof error === "object" && error !== null && "errorKind" in error
      ? (error as { errorKind?: unknown }).errorKind
      : undefined;
  return kind !== "access" && kind !== "application";
}

/** Bounded exponential backoff: 250 ms doubling to a five-second ceiling. */
export function connectionRetryDelayMs(attempt: number): number {
  return Math.min(5_000, 250 * 2 ** Math.min(Math.max(0, attempt), 5));
}
