import { describe, expect, it } from "vitest";
import { OwnedMethodCalls } from "./owned-method-calls.js";
const pending = async () => false;

describe("OwnedMethodCalls", () => {
  it("retains one settled outcome for duplicate dispatch until canonical terminal observation", async () => {
    const calls = new OwnedMethodCalls<number>();
    let terminal = false;
    let executions = 0;
    const execute = async () => {
      executions++;
      return 42;
    };
    const original = calls.run("call", "route", execute, async () => terminal);
    expect(calls.run("call", "route", execute, pending)).toBe(original);
    expect(() => calls.run("call", "other-route", execute, pending)).toThrow(
      /identity/,
    );
    expect(await original).toBe(42);
    expect(calls.run("call", "route", execute, pending)).toBe(original);
    await expect(calls.observeTerminal("call")).resolves.toBe(false);
    expect(calls.size).toBe(1);
    terminal = true;
    await calls.observeTerminal("call");
    expect(calls.size).toBe(0);
    expect(executions).toBe(1);
  });

  it("preserves original settled errors for duplicates without treating them as cleanup debt", async () => {
    const calls = new OwnedMethodCalls<void>();
    const failure = new Error("actual provider refused operation");
    const original = calls.run(
      "call",
      "route",
      async () => {
        throw failure;
      },
      pending,
    );
    await expect(original).rejects.toBe(failure);
    expect(calls.run("call", "route", async () => {}, pending)).toBe(original);
    await expect(
      calls.cancel("call", new Error("no body remains")),
    ).resolves.toBeUndefined();
    await expect(calls.release(new Error("retired"))).resolves.toBeUndefined();
    expect(calls.size).toBe(0);
    expect(() =>
      calls.run("new-call", "route", async () => {}, pending),
    ).toThrow(/released/);
  });

  it("cancels before dispatch without starting provider work", async () => {
    const calls = new OwnedMethodCalls<void>();
    let executions = 0;
    const original = calls.run(
      "call",
      "route",
      async () => {
        executions++;
      },
      pending,
    );
    void original.catch(() => undefined);
    const reason = new Error("cancelled before dispatch");
    await calls.cancel("call", reason);
    await expect(original).rejects.toBe(reason);
    expect(executions).toBe(0);
    expect(calls.size).toBe(1);
    await calls.release(reason);
    expect(calls.size).toBe(0);
  });

  it("canonical terminal observation never forgets a still-running body", async () => {
    const calls = new OwnedMethodCalls<void>();
    let join!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const original = calls.run(
      "call",
      "route",
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          join = () => reject(signal.reason);
          signal.addEventListener("abort", entered, { once: true });
        }),
      async () => true,
    );
    void original.catch(() => undefined);
    await Promise.resolve();
    await calls.observeTerminal("call");
    expect(calls.size).toBe(1);
    let acknowledged = false;
    const cancellation = calls
      .cancel("call", new Error("explicit cancellation"))
      .then(() => {
        acknowledged = true;
      });
    await started;
    expect(acknowledged).toBe(false);
    join();
    await cancellation;
    expect(acknowledged).toBe(true);
    expect(calls.size).toBe(0);
  });

  it("failed canonical read keeps original deduplication authority", async () => {
    const calls = new OwnedMethodCalls<number>();
    const failure = new Error("canonical read failed");
    const original = calls.run(
      "call",
      "route",
      async () => 42,
      async () => {
        throw failure;
      },
    );
    await original;
    await expect(calls.observeTerminal("call")).rejects.toBe(failure);
    expect(calls.run("call", "route", async () => 99, pending)).toBe(original);
  });

  it("joins all pending bodies and propagates failure observed during cancellation once", async () => {
    const calls = new OwnedMethodCalls<void>();
    const failure = new Error("original resource close failed");
    const cancelled: string[] = [];
    let joinSecond!: () => void;
    const start = (key: string, failed: boolean) => {
      const operation = calls.run(
        key,
        key,
        (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                cancelled.push(key);
                if (failed) reject(failure);
                else joinSecond = () => reject(signal.reason);
              },
              { once: true },
            );
          }),
        pending,
      );
      void operation.catch(() => undefined);
    };
    start("first", true);
    start("second", false);
    await Promise.resolve();
    let released = false;
    const release = calls
      .release(new Error("activation released"))
      .finally(() => {
        released = true;
      });
    void release.catch(() => undefined);
    await Promise.resolve();
    expect(cancelled).toEqual(["first", "second"]);
    expect(released).toBe(false);
    joinSecond();
    await expect(release).rejects.toBe(failure);
    expect(calls.size).toBe(0);
    await expect(
      calls.release(new Error("all bodies already joined")),
    ).resolves.toBeUndefined();
  });
});
