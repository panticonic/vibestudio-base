import { describe, expect, it } from "vitest";
import { observeNativeActions } from "./native-action-journal.js";
const owner = { contextId: "owned-context", runId: "actual-teacher-run" };
describe("independent accepted-port observations", () => {
  it("retains the actual owner and opt-out selected at construction", () => {
    const identity = { ...owner }, options = { enabled: true };
    const observed = observeNativeActions({ native: { read() { return 1; } } }, identity, options);
    identity.contextId = "foreign"; options.enabled = false;
    observed.services.native.read();
    expect(observed.snapshot().contextId).toBe(owner.contextId);
    expect(observed.snapshot().operations).toHaveLength(1);
  });
  it("preserves actual values, sync ports, repeated reads and receivers", () => {
    let calls = 0;
    const native = { read() { calls++; expect(this).toBe(native); return { value: calls }; } };
    const observed = observeNativeActions({ native }, owner);
    expect(observed.services.native.read()).toEqual({ value: 1 });
    expect(observed.services.native.read()).toEqual({ value: 2 });
    expect(calls).toBe(2);
    expect(observed.snapshot().operations).toEqual([
      { index: 0, service: "native", method: "read", status: "completed", argsJson: "[]", resultJson: '{"value":1}' },
      { index: 1, service: "native", method: "read", status: "completed", argsJson: "[]", resultJson: '{"value":2}' },
    ]);
  });
  it("records async completion independently of start order and keeps result identity", async () => {
    const joins: (() => void)[] = [];
    const native = { async read(id: number) { await new Promise<void>(resolve => joins[id] = resolve); return { id }; } };
    const observed = observeNativeActions({ native }, owner);
    const first = observed.services.native.read(0), second = observed.services.native.read(1);
    expect(observed.snapshot().operations.every(row => row.status === "pending")).toBe(true);
    joins[1]!(); const value = await second;
    expect(value).toEqual({ id: 1 });
    expect(observed.snapshot().operations.map(row => row.status)).toEqual(["pending", "completed"]);
    joins[0]!(); await first;
    const snapshot = observed.snapshot(); snapshot.operations[0]!.resultJson = "forged";
    expect(observed.snapshot().operations[0]!.resultJson).toBe('{"id":0}');
  });
  it("preserves a native refusal rather than recording it as a successful action", async () => {
    const failure = new Error("foreign owner");
    const observed = observeNativeActions({ native: { async read(id: string) { if (id !== "owned") throw failure; return id; } } }, owner);
    await expect(observed.services.native.read("foreign")).rejects.toBe(failure);
    expect(observed.snapshot().operations[0]).toEqual({ index: 0, service: "native", method: "read", status: "failed", argsJson: '["foreign"]' });
  });
  it("does not inspect result getters or turn unsupported wire values into positives", () => {
    let getters = 0;
    const value = { get secret() { getters++; return 1; } };
    const observed = observeNativeActions({ native: { read() { return value; } } }, owner);
    expect(observed.services.native.read()).toBe(value);
    expect(getters).toBe(0);
    expect(observed.snapshot().operations[0]!.unsupported).toBe("non-json-result");
  });
  it("keeps opaque/accessor/data-bearing services unchanged", () => {
    let getters = 0;
    const service = { count: 0, read() { this.count++; return this.count; } };
    const services = Object.defineProperty({ service }, "lazy", { enumerable: true, get() { getters++; return service; } });
    const observed = observeNativeActions(services, owner);
    expect(getters).toBe(0);
    expect(observed.services.service).toBe(service);
    expect(observed.services.service.read()).toBe(1);
    expect(observed.services.service.count).toBe(1);
    expect(observed.snapshot().unobservedServices).toEqual(["service", "lazy"]);
    expect(observed.snapshot().operations).toEqual([]);
  });
  it("bounds only observation storage and never suppresses a real native operation", () => {
    let calls = 0;
    const observed = observeNativeActions({ native: { read() { calls++; return "large"; } } }, owner, { maxOperations: 1, maxValueBytes: 3 });
    expect(observed.services.native.read()).toBe("large");
    expect(observed.services.native.read()).toBe("large");
    expect(calls).toBe(2);
    expect(observed.snapshot().exhausted).toBe(true);
    expect(observed.snapshot().operations).toHaveLength(1);
    expect(observed.snapshot().operations[0]!.unsupported).toBe("value-bound");
  });
  it("supports an explicit observation opt-out without changing I/O", () => {
    const result = { actual: true };
    const observed = observeNativeActions({ native: { read() { return result; } } }, owner, { enabled: false });
    expect(observed.services.native.read()).toBe(result);
    expect(observed.snapshot().operations).toEqual([]);
  });
});
