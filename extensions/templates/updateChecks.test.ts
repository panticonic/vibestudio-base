import { afterEach, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as workspace from "./workspace";
import { createTemplateUpdateChecks } from "./updateChecks";
import type { ExtensionContextLike } from "./context";
import { WORKSPACE_APP_VERSION } from "@vibestudio/shared/vcs/systemEpoch";
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture(
  requirement = { systemEpoch: 0 } as {
    systemEpoch: number;
    minimumAppVersion?: string;
    availableAppVersion?: string;
    hostError?: string;
  },
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "update-checks-"));
  roots.push(root);
  const source = {
    url: "https://example.test/personal.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const target = { ...source, commit: "b".repeat(40) };
  const observation: Pick<
    workspace.SemanticWorkspaceObservation,
    "manifest" | "templateSources"
  > = {
    manifest: {
      top: { systemEpoch: 0 },
      inventory: { repositories: [] },
      dependencies: [],
    },
    templateSources: [source],
  };
  vi.spyOn(workspace, "observeWorkspace").mockResolvedValue(
    observation as never,
  );
  const resolve = vi.fn().mockResolvedValue(target);
  const deliver = vi.fn().mockResolvedValue(undefined);
  const call = vi.fn(
    async (_target: string, method: string, ...args: unknown[]) => {
      if (method === "workspaceTemplateSource.readCompatibility")
        return requirement;
      if (method === "workers.resolveService")
        return { kind: "durable-object", targetId: "inbox" };
      if (method === "putUserNotification") return deliver(...args);
      if (method === "deleteUserNotification") return {};
      throw new Error(`Unexpected method ${method}`);
    },
  );
  let currentAppVersion = WORKSPACE_APP_VERSION as string;
  let owner: string | undefined = "usr_one";
  const ctx = {
    workspace: {
      getInfo: async () => ({
        id: "workspace-one",
        appVersion: WORKSPACE_APP_VERSION,
        currentAppVersion,
      }),
    },
    invocation: { current: () => ({ caller: { userId: owner } }) },
    storage: { root },
    rpc: { call },
    emit: vi.fn(),
    log: { info: vi.fn() },
  } as unknown as ExtensionContextLike;
  return {
    hostVersion: (version: string) => {
      currentAppVersion = version;
    },
    observation,
    source,
    target,
    resolve,
    deliver,
    call,
    ctx,
    checker: createTemplateUpdateChecks(ctx, resolve),
    owner: (value: string | undefined) => {
      owner = value;
    },
  };
}
it("durably announces an exact parent update with a merge-agent action, without preparing a merge or calling a model", async () => {
  const f = await fixture();
  expect(await f.checker.status()).toEqual({
    workspaceEpoch: 0,
    workspaceAppVersion: WORKSPACE_APP_VERSION,
    currentAppVersion: WORKSPACE_APP_VERSION,
    checks: [],
  });
  await f.checker.check(); // UI discovery must not consume the notification.
  expect(f.deliver).not.toHaveBeenCalled();
  expect(await f.checker.signal()).toEqual({
    protocol: "automation-signal.v1",
    prompt: null,
  });
  expect(f.deliver).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "usr_one",
      kind: "workspace.template-update",
      data: expect.objectContaining({
        prompt: expect.stringContaining(f.target.commit),
      }),
    }),
  );
  const notice = f.deliver.mock.calls[0]![0] as { data: { prompt: string } };
  expect(notice.data.prompt).toContain("preserve local intent");
  expect(notice.data.prompt).toContain("before publishing");
  await createTemplateUpdateChecks(f.ctx, f.resolve).signal();
  expect(f.deliver).toHaveBeenCalledTimes(1);
  f.owner("usr_two");
  await createTemplateUpdateChecks(f.ctx, f.resolve).signal();
  expect(f.deliver).toHaveBeenCalledTimes(2);
  f.owner(undefined);
  await expect(f.checker.signal()).rejects.toThrow("authenticated owner");
  expect(
    f.call.mock.calls.every(([, method]) =>
      [
        "workspaceTemplateSource.readCompatibility",
        "workers.resolveService",
        "putUserNotification",
        "deleteUserNotification",
      ].includes(method),
    ),
  ).toBe(true);
});
it("reports foreign generations and minimum app requirements without parsing or activating future source", async () => {
  const f = await fixture({ systemEpoch: 1, minimumAppVersion: "1.2.0" });
  expect((await f.checker.check()).checks[0]).toMatchObject({
    status: "different-epoch",
    targetEpoch: 1,
    targetMinimumAppVersion: "1.2.0",
  });
  await f.checker.signal();
  expect(f.deliver.mock.calls[0]![0]).toMatchObject({
    message: expect.stringContaining("Requires Vibestudio 1.2.0"),
  });
});
it("gates same-generation updates that require a newer app release", async () => {
  const f = await fixture({ systemEpoch: 0, minimumAppVersion: "0.99.0" });
  expect((await f.checker.check()).checks[0]?.status).toBe(
    "requires-app-update",
  );
  await f.checker.signal();
  expect(f.deliver.mock.calls[0]![0].data.prompt).toContain("0.99.0");
});
it("does not consume failed notification delivery and preserves source-check failures", async () => {
  const f = await fixture();
  f.deliver.mockRejectedValueOnce(new Error("Inbox unavailable"));
  await expect(f.checker.signal()).rejects.toThrow("Inbox unavailable");
  await createTemplateUpdateChecks(f.ctx, f.resolve).signal();
  expect(f.deliver).toHaveBeenCalledTimes(2);
  expect(f.deliver.mock.calls[0]).toEqual(f.deliver.mock.calls[1]);
  f.resolve.mockRejectedValue(new Error("Offline"));
  await expect(f.checker.signal()).rejects.toThrow("Offline");
  expect((await f.checker.status()).checks[0]?.status).toBe("error");
});
it("coalesces concurrent owner signals and checks", async () => {
  const f = await fixture();
  await Promise.all([f.checker.signal(), f.checker.signal()]);
  expect(f.resolve).toHaveBeenCalledTimes(1);
  expect(f.deliver).toHaveBeenCalledTimes(1);
});
it("announces the same target again when the surrounding app changes, even if the retained workspace host does not", async () => {
  const f = await fixture({ systemEpoch: 1, minimumAppVersion: "1.0.0" });
  await f.checker.signal();
  f.hostVersion("1.0.0");
  await f.checker.signal();
  expect(f.deliver).toHaveBeenCalledTimes(2);
  expect(f.deliver.mock.calls[1]![0].data.prompt).toContain(
    "surrounding app: Vibestudio 1.0.0",
  );
  await f.checker.signal();
  expect(f.deliver).toHaveBeenCalledTimes(2);
});

it("reads persisted discovery while deriving host versions from the live workspace", async () => {
  const f = await fixture();
  const checked = await f.checker.check();
  await fs.writeFile(
    path.join(f.ctx.storage.root, "upstream-availability.json"),
    JSON.stringify({ checks: checked.checks }),
  );
  f.hostVersion("1.0.0");
  expect(await f.checker.status()).toEqual({
    workspaceEpoch: 0,
    workspaceAppVersion: WORKSPACE_APP_VERSION,
    currentAppVersion: "1.0.0",
    checks: checked.checks,
  });
});

it("retires a notice as soon as its installed baseline changes, without a network check", async () => {
  const f = await fixture();
  await f.checker.signal();
  const id = f.deliver.mock.calls[0]![0].id;
  f.observation.templateSources = [f.target];
  f.resolve.mockRejectedValue(new Error("Offline"));
  await f.checker.reconcileInstalled();
  expect(f.call).toHaveBeenCalledWith("inbox", "deleteUserNotification", {
    userId: "usr_one",
    id,
  });
  expect(f.deliver).toHaveBeenCalledTimes(1);
});

it("refreshes one coherent workspace notice when a parent and its dependency both change", async () => {
  const f = await fixture();
  const base = { ...f.source, url: "https://example.test/base.git" };
  const baseTarget = { ...base, commit: "c".repeat(40) };
  f.observation.templateSources = [base, f.source];
  f.observation.manifest.installation = {
    sources: [
      {
        pin: base,
        manifest: JSON.stringify({
          systemEpoch: 0,
          template: { repositories: [] },
        }),
      },
      {
        pin: f.source,
        manifest: JSON.stringify({
          systemEpoch: 0,
          template: { repositories: [], dependencies: [{ url: base.url }] },
        }),
      },
    ],
  };
  f.resolve.mockImplementation(async (source) =>
    source.url === base.url ? baseTarget : f.target,
  );
  await f.checker.signal();
  const notice = f.deliver.mock.calls[0]![0];
  expect(f.deliver).toHaveBeenCalledTimes(1);
  expect(notice.data.updates).toHaveLength(2);
  expect(notice.data.prompt).toContain("one coherent workspace upgrade");
  const parents = JSON.parse(
    notice.data.prompt.split("Parent targets (data): ")[1].split(".\n")[0],
  );
  expect(
    parents.map((check: { source: { url: string } }) => check.source.url),
  ).toEqual([f.source.url]);
  const previousId = notice.id;
  f.hostVersion("0.1.85");
  await f.checker.signal();
  expect(f.deliver).toHaveBeenCalledTimes(2);
  expect(f.call).toHaveBeenCalledWith("inbox", "deleteUserNotification", {
    userId: "usr_one",
    id: previousId,
  });
});

it("replays frozen notifications and allocates new identities on an app-version round trip", async () => {
  const f = await fixture();
  const inbox = new Map<string, unknown>();
  f.deliver.mockImplementation(async (notice) => {
    const existing = inbox.get(notice.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(notice))
      throw new Error("revision reused for other data");
    inbox.set(notice.id, structuredClone(notice));
  });
  f.hostVersion("0.1.84");
  await f.checker.signal();
  f.hostVersion("0.1.85");
  await f.checker.signal();
  f.hostVersion("0.1.84");
  await f.checker.signal();
  expect(new Set(f.deliver.mock.calls.map(([notice]) => notice.id)).size).toBe(
    3,
  );
  expect(f.deliver.mock.calls.map(([notice]) => notice.revision)).toEqual([
    1, 2, 3,
  ]);
});

it("retires superseded upstream targets on discovery and preserves the notice on failed checks", async () => {
  const f = await fixture();
  await f.checker.signal();
  const id = f.deliver.mock.calls[0]![0].id;
  f.resolve.mockRejectedValue(new Error("Offline"));
  await expect(f.checker.signal()).rejects.toThrow("Offline");
  expect(
    f.call.mock.calls.filter(
      ([, method]) => method === "deleteUserNotification",
    ),
  ).toHaveLength(0);
  f.resolve.mockResolvedValue(f.source);
  await f.checker.check();
  expect(f.call).toHaveBeenCalledWith("inbox", "deleteUserNotification", {
    userId: "usr_one",
    id,
  });
});

it("keeps member delivery independent when another member has a failed receipt", async () => {
  const f = await fixture();
  await f.checker.signal();
  f.hostVersion("0.1.85");
  f.deliver.mockImplementation(async (notice) => {
    if (notice.userId === "usr_one") throw new Error("Owner inbox unavailable");
  });
  await expect(f.checker.signal()).rejects.toThrow("Owner inbox unavailable");
  f.owner("usr_two");
  await expect(f.checker.signal()).resolves.toEqual({
    protocol: "automation-signal.v1",
    prompt: null,
  });
  expect(f.deliver.mock.calls.at(-1)![0].userId).toBe("usr_two");
});

it("keeps a missing retained host actionable in the inbox without suggesting another app update", async () => {
  const f = await fixture({
    systemEpoch: 1,
    minimumAppVersion: "1.2.0",
    hostError: "Historical workspace host 1 is unavailable",
  });
  f.hostVersion("2.0.0");
  await f.checker.signal();
  const notice = f.deliver.mock.calls[0]![0];
  expect(notice.message).toContain("compatible workspace host is unavailable");
  expect(notice.data.prompt).toContain("1.2.0");
  expect(notice.data.updates[0].hostError).toContain("unavailable");
});
