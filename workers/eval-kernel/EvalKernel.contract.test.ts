/**
 * The kernel call contract of docs/dolt-redesign.md §7.5.1: `start`, `await`,
 * `events`, `cancel`, and the kernel's own caller check (the hosting entity, or
 * a session whose admission nonce matches), with one commit per accepted and
 * per finished run on a Dolt cell.
 */
import { describe, expect, it, vi } from "vitest";
import { doltLocalPatterns } from "@vibestudio/durable/dolt";
import { FakeDoltStorage } from "@vibestudio/durable/test-dolt";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { EvalKernel } from "./EvalKernel.js";
import type { KernelCaller } from "./contract.js";

const session = (admissionNonce: string): KernelCaller => ({ kind: "session", admissionNonce });
const NONCE_A = "nonce-of-run-a-000000000000";
const NONCE_B = "nonce-of-run-b-000000000000";

async function kernel(options: { dolt?: boolean } = {}) {
  const fake = options.dolt
    ? await FakeDoltStorage.create({ doltLocal: doltLocalPatterns([]) })
    : null;
  const fixture = await createTestDO(EvalKernel, undefined, fake ? { storage: fake.storage } : {});
  // The run itself is not under test: it finishes at once with a value.
  (fixture.instance as unknown as { runLocked: unknown }).runLocked = () =>
    Promise.resolve({ success: true, console: "", returnValue: 1 });
  return { ...fixture, fake };
}

describe("EvalKernel call contract", () => {
  it("accepts a run, runs it in its own lifetime, and a caller pulls the committed result", async () => {
    const { instance, fake } = await kernel({ dolt: true });
    const accepted = await instance.start({ runId: "r1", code: "return 1" });
    expect(accepted).toMatchObject({ runId: "r1", status: "pending", existing: false });
    // `start` returned after the accepted row was committed, before the cell ran.
    expect(fake!.dolt.log().map((entry) => entry.message)).toContain("eval: r1 accepted");

    const done = await instance.await("r1", { waitMs: 5_000 });
    expect(done).toMatchObject({ status: "done", result: { success: true, returnValue: 1 } });
    await vi.waitFor(() =>
      expect(fake!.dolt.log().map((entry) => entry.message)).toContain("eval: r1 done")
    );
    // A caller that comes back later reads the same row, and the page of events is bounded.
    expect(instance.get("r1")).toMatchObject({ status: "done" });
    const page = instance.events("r1", { after: 0, limit: 2 });
    expect(page.events).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(instance.events("r1", { after: page.next, limit: 100 }).events.length).toBeGreaterThan(
      0
    );
  });

  it("await returns a non-terminal status when waitMs passes, and the caller calls again", async () => {
    const { instance } = await kernel();
    let release!: () => void;
    (instance as unknown as { runLocked: unknown }).runLocked = () =>
      new Promise((resolve) => {
        release = () => resolve({ success: true, console: "", returnValue: 2 });
      });
    await instance.start({ runId: "slow", code: "x" });
    const waiting = await instance.await("slow", { waitMs: 50 });
    expect(waiting.status).not.toBe("done");
    expect(waiting.result).toBeUndefined();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release();
    await expect(instance.await("slow", { waitMs: 5_000 })).resolves.toMatchObject({
      status: "done",
      result: { returnValue: 2 },
    });
  });

  it("serves the hosting entity for every method, with no nonce", async () => {
    const { instance } = await kernel();
    await instance.start(
      { runId: "r1", code: "x", executionSessionNonce: NONCE_A },
      { kind: "host" }
    );
    await instance.await("r1", { waitMs: 5_000 }, { kind: "host" });
    expect(instance.get("r1", { kind: "host" })).toMatchObject({ status: "done" });
    expect(instance.receipt("r1")).not.toBeNull();
    await expect(instance.reset({ kind: "host" })).resolves.toEqual({ ok: true });
  });

  it("serves a session only with the nonce its run was admitted under", async () => {
    const { instance } = await kernel();
    await instance.start(
      { runId: "run-a", code: "x", executionSessionNonce: NONCE_A },
      session(NONCE_A)
    );
    await instance.start(
      { runId: "run-b", code: "x", executionSessionNonce: NONCE_B },
      session(NONCE_B)
    );
    await instance.await("run-a", { waitMs: 5_000 }, session(NONCE_A));
    await instance.await("run-b", { waitMs: 5_000 }, session(NONCE_B));

    const refused: Array<() => unknown> = [
      () => instance.await("run-a", { waitMs: 0 }, session(NONCE_B)),
      () => instance.events("run-a", {}, session(NONCE_B)),
      () => instance.get("run-a", session(NONCE_B)),
      () => instance.receipt("run-a", session(NONCE_B)),
      () => instance.cancel("run-a", session(NONCE_B)),
      () => instance.await("run-a", { waitMs: 0 }, session("")),
    ];
    for (const call of refused) {
      await expect(Promise.resolve().then(call)).rejects.toMatchObject({ code: "EACCES" });
    }
    // The run's own nonce still reads it after it ended.
    expect(instance.get("run-a", session(NONCE_A))).toMatchObject({ status: "done" });
    // An unknown run has nothing to protect.
    expect(instance.get("nobody", session(NONCE_A))).toEqual({ status: "unknown" });
    // A caller that is neither shape is refused.
    expect(() => instance.get("run-a", { kind: "other" } as unknown as KernelCaller)).toThrow(
      /neither the hosting entity nor a session/
    );
  });

  it("start: the run's nonce is the session's, and only a run that has not begun is re-admitted", async () => {
    const { instance } = await kernel();
    await expect(
      instance.start({ runId: "r1", code: "x", executionSessionNonce: NONCE_A }, session(NONCE_B))
    ).rejects.toMatchObject({ code: "EACCES" });

    // A pending run (accepted, not yet started) takes a fresh admission after a host restart.
    (instance as unknown as { runLocked: unknown }).runLocked = () => new Promise(() => undefined);
    // `scheduleRun` is not under test: hold the run at `pending` by not scheduling it.
    const schedule = vi
      .spyOn(instance as unknown as { scheduleRun(id: string): void }, "scheduleRun")
      .mockImplementation(() => undefined);
    await instance.start(
      { runId: "pending-run", code: "x", executionSessionNonce: NONCE_A },
      session(NONCE_A)
    );
    await expect(
      instance.start(
        { runId: "pending-run", code: "x", executionSessionNonce: NONCE_B },
        session(NONCE_B)
      )
    ).resolves.toMatchObject({ existing: true });
    schedule.mockRestore();
  });

  it("start: a run that has begun answers only to its own nonce", async () => {
    const { instance } = await kernel();
    await instance.start(
      { runId: "r1", code: "x", executionSessionNonce: NONCE_A },
      session(NONCE_A)
    );
    await instance.await("r1", { waitMs: 5_000 }, session(NONCE_A));
    await expect(
      instance.start({ runId: "r1", code: "x", executionSessionNonce: NONCE_B }, session(NONCE_B))
    ).rejects.toMatchObject({ code: "EACCES" });
    await expect(
      instance.start({ runId: "r1", code: "x", executionSessionNonce: NONCE_A }, session(NONCE_A))
    ).resolves.toMatchObject({ existing: true });
  });

  it("scope-level calls take any run's nonce, or none when the kernel has no run", async () => {
    const { instance } = await kernel();
    // No run yet: nothing to protect.
    await expect(instance.reset(session(""))).resolves.toEqual({ ok: true });
    await instance.start(
      { runId: "r1", code: "x", executionSessionNonce: NONCE_A },
      session(NONCE_A)
    );
    await instance.await("r1", { waitMs: 5_000 }, session(NONCE_A));
    await expect(instance.reset(session(NONCE_B))).rejects.toMatchObject({ code: "EACCES" });
    await expect(instance.deleteScopeValue("k", session(NONCE_B))).rejects.toMatchObject({
      code: "EACCES",
    });
    await expect(instance.readScopeTextPage("k", 0, 10, session(NONCE_B))).rejects.toMatchObject({
      code: "EACCES",
    });
    await expect(instance.reset(session(NONCE_A))).resolves.toEqual({ ok: true });
  });
});
