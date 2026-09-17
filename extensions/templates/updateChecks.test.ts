import { afterEach, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as workspace from "./workspace";
import { createTemplateUpdateChecks } from "./updateChecks";
import type { ExtensionContextLike } from "./context";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
it("checks without merging, wakes only for unacknowledged targets, and reports a foreign epoch before parsing its schema", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "update-checks-"));
  roots.push(root);
  const source = {
    url: "https://example.test/personal.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const target = { ...source, commit: "b".repeat(40) };
  vi.spyOn(workspace, "observeWorkspace").mockResolvedValue({
    manifest: { top: { systemEpoch: 0 } },
    templateSources: [source],
  } as never);
  const resolve = vi.fn().mockResolvedValue(target);
  const call = vi.fn().mockResolvedValue(1);
  let owner: string | undefined = "usr_one";
  const ctx = {
    invocation: { current: () => ({ caller: { userId: owner } }) },
    storage: { root },
    rpc: { call },
    emit: vi.fn(),
    log: { info: vi.fn() },
  } as unknown as ExtensionContextLike;
  const checker = createTemplateUpdateChecks(ctx, resolve);
  expect(await checker.status()).toEqual({ workspaceEpoch: 0, checks: [] });
  const signal = await checker.signal();
  expect(signal.prompt).toContain("different-epoch");
  expect(signal.prompt).toContain(target.commit);
  expect(call).toHaveBeenCalledWith(
    "main",
    "workspaceTemplateSource.readEpoch",
    target,
  );
  expect(
    call.mock.calls.every(
      (args) => args[1] === "workspaceTemplateSource.readEpoch",
    ),
  ).toBe(true);
  // Reading the UI cache never consumes an agent notification obligation.
  await checker.status();
  expect((await checker.signal()).prompt).not.toBeNull();
  await checker.acknowledge({ targets: [target] });
  const restarted = createTemplateUpdateChecks(ctx, resolve);
  expect(await restarted.signal()).toEqual({
    protocol: "automation-signal.v1",
    prompt: null,
  });
  owner = "usr_two";
  expect((await restarted.signal()).prompt).not.toBeNull();
  owner = undefined;
  await expect(restarted.signal()).rejects.toThrow("authenticated owner");
  owner = "usr_one";
  resolve.mockResolvedValue({ ...target, commit: "c".repeat(40) });
  expect((await restarted.signal()).prompt).not.toBeNull();
  resolve.mockRejectedValue(new Error("Offline"));
  await expect(restarted.signal()).rejects.toThrow("Offline");
  expect((await restarted.status()).checks[0]?.status).toBe("error");
});
it("coalesces concurrent checks and does not acquire a snapshot when the pin is unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "update-checks-"));
  roots.push(root);
  const source = {
    url: "https://example.test/base.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  vi.spyOn(workspace, "observeWorkspace").mockResolvedValue({
    manifest: { top: { systemEpoch: 0 } },
    templateSources: [source],
  } as never);
  const resolve = vi.fn().mockResolvedValue(source),
    call = vi.fn();
  const checks = createTemplateUpdateChecks(
    {
      storage: { root },
      rpc: { call },
      emit: vi.fn(),
    } as unknown as ExtensionContextLike,
    resolve,
  );
  const [first, second] = await Promise.all([checks.check(), checks.check()]);
  expect(first).toEqual(second);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(call).not.toHaveBeenCalled();
  expect(first.checks[0]?.status).toBe("current");
});
