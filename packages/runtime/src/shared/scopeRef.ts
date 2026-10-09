/** Shared global key used to persist and reacquire live runtime objects. */
declare const SCOPE_REF_KEY: unique symbol;
export const SCOPE_REF: typeof SCOPE_REF_KEY = Symbol.for(
  "vibestudio.scopeRef",
) as typeof SCOPE_REF_KEY;

/**
 * Durable identity for eval scope persistence. The scope serializer stores
 * only `{ kind, id }`; the eval host reacquires the object through the same
 * lookup-by-id path user code uses, never restoring cached routing or leases.
 */
export interface ScopeRef {
  kind: string;
  id: string;
}

export function defineScopeRef(target: object, ref: () => ScopeRef): void {
  Object.defineProperty(target, SCOPE_REF, {
    value: ref,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}
