import { nativeWireEqual } from "@workspace/natlang-services/nativeWireEqual";

export type NativeActionObservation = {
  index: number;
  service: string;
  method: string;
  status: "pending" | "completed" | "failed";
  argsJson?: string;
  resultJson?: string;
  resultKind?: "void";
  unsupported?: "non-json-arguments" | "non-json-result" | "value-bound";
};
export type NativeActionJournal = {
  schema: "natlang.native-action-journal/1";
  contextId: string;
  runId: string;
  exhausted: boolean;
  operations: NativeActionObservation[];
  unobservedServices: string[];
};

/** Record accepted port I/O independently of the executor's own call recorder.
 * This is custody, never a claim that a return, authored content or goal is correct.
 * Consumers must separately register native operation contracts and select exact
 * captured generations; a successful operation alone does not certify a call.
 */
export function observeNativeActions<T extends Readonly<Record<string, object>>>(
  services: T,
  owner: { contextId: string; runId: string },
  options: { enabled?: boolean; maxValueBytes?: number; maxJournalBytes?: number; maxOperations?: number } = {},
): { services: T; snapshot(): NativeActionJournal } {
  if (!owner.contextId || !owner.runId) throw new TypeError("Native action observations need their actual owner");
  const actualOwner = { contextId: owner.contextId, runId: owner.runId };
  const enabled = options.enabled !== false;
  const rows: NativeActionObservation[] = [];
  let bytes = 0, exhausted = false;
  const maxValue = options.maxValueBytes ?? 1024 * 1024;
  const maxJournal = options.maxJournalBytes ?? 16 * 1024 * 1024;
  const maxOperations = options.maxOperations ?? 4096;
  if (![maxValue, maxJournal, maxOperations].every(value => Number.isSafeInteger(value) && value > 0))
    throw new TypeError("Native action observation bounds must be positive integers");
  const encode = (value: unknown): { text?: string; bound?: boolean } => {
    // Validity is checked without invoking accessors or toJSON; JSON serialization
    // subsequently sees only ordinary closed wire values. Never change a port's
    // success/error because an observation is unsupported or too large.
    try {
      if (!nativeWireEqual(value, value)) return {};
      const text = JSON.stringify(value);
      const size = new TextEncoder().encode(text).length;
      if (size > maxValue || bytes + size > maxJournal) { exhausted = true; return { bound: true }; }
      bytes += size;
      return { text };
    } catch { return {}; }
  };
  const wrapped: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(services);
  const unobservedServices: string[] = [];
  for (const [service, entry] of Object.entries(wrapped)) {
    if (!entry.enumerable || !("value" in entry) || !entry.value || typeof entry.value !== "object") {
      unobservedServices.push(service);
      continue;
    }
    const target = entry.value as object;
    const descriptors = Object.getOwnPropertyDescriptors(target);
    const prototype = Object.getPrototypeOf(target);
    // The normal assigned service is a record of bound methods. Opaque/class,
    // accessor or mutable data-bearing services keep their exact original view;
    // absence of journal evidence excludes their actions rather than changing I/O.
    if ((prototype !== null && Object.getPrototypeOf(prototype) !== null) ||
        Reflect.ownKeys(descriptors).some(key => typeof key !== "string" ||
          !Object.hasOwn(descriptors[key as string]!, "value") || typeof descriptors[key as string]!.value !== "function")) {
      wrapped[service] = entry;
      unobservedServices.push(service);
      continue;
    }
    const methods = { ...descriptors };
    for (const [method, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "function") continue;
      const operation = descriptor.value;
      methods[method] = { ...descriptor, value: function (...args: unknown[]) {
        if (!enabled) return Reflect.apply(operation, target, args);
        let row: NativeActionObservation | undefined;
        if (rows.length < maxOperations) {
          const encoded = encode(args);
          row = { index: rows.length, service, method, status: "pending",
            ...(encoded.text !== undefined ? { argsJson: encoded.text } :
              { unsupported: encoded.bound ? "value-bound" : "non-json-arguments" }) };
          rows.push(row);
        } else exhausted = true;
        const completed = (value: unknown) => {
          if (row) {
            row.status = "completed";
            if (value === undefined) row.resultKind = "void";
            else {
              const encoded = encode(value);
              if (encoded.text !== undefined) row.resultJson = encoded.text;
              else row.unsupported ??= encoded.bound ? "value-bound" : "non-json-result";
            }
          }
          return value;
        };
        const failed = (error: unknown): never => { if (row) row.status = "failed"; throw error; };
        try {
          const value: unknown = Reflect.apply(operation, target, args);
          // Async authored ports return the realm's ordinary Promise. Preserve
          // synchronous ports and opaque thenables without probing their getters.
          if (value instanceof Promise) return value.then(completed, failed);
          return completed(value);
        } catch (error) { return failed(error); }
      } };
    }
    wrapped[service] = { ...entry, value: Object.defineProperties(Object.create(Object.getPrototypeOf(target)), methods) };
  }
  return {
    services: Object.defineProperties(Object.create(Object.getPrototypeOf(services)), wrapped) as T,
    snapshot: () => ({ schema: "natlang.native-action-journal/1", ...actualOwner, exhausted,
      operations: rows.map(row => ({ ...row })), unobservedServices: [...unobservedServices] }),
  };
}
