import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { retainedInspectionPin } from "./inspectionPin.js";
import { activate } from "./index.js";

describe("exact template reinspection", () => {
  it("keeps a reviewed pin when its moving ref may have advanced", async () => {
    const pin = {
      url: "https://example.test/app.git",
      ref: "refs/heads/main",
      commit: "a".repeat(40),
    };
    expect(retainedInspectionPin({ pin })).toEqual(pin);
  });
});

it("delegates every exact pin to the host-owned source acquisition contract", async () => {
  const pin = {
    url: "https://example.invalid/dirty.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const inspected = {
    pin,
    presentation: { name: "Dirty source" },
    repositories: ["panels/example"],
    dependencies: [],
  };
  const call = vi.fn(async () => inspected);
  const api = await activate({
    storage: { root: process.cwd() },
    log: { info: vi.fn() },
    rpc: schemaRpcMock({ call }),
  } as never);

  await expect(api.inspect({ pin })).resolves.toEqual(inspected);
  expect(call).toHaveBeenCalledWith(
    "main",
    "workspaceTemplateSource.inspectExact",
    [pin],
    undefined,
  );
});

it("prefers an instance-designated checkpoint to remote discovery", async () => {
  const pin = {
    url: "git+https://example.invalid/local.git",
    ref: "refs/heads/vibestudio-dev-checkpoint",
    commit: "b".repeat(40),
  };
  const call = vi.fn(async (_target: string, method: string) => {
    if (method === "workspaceTemplateSource.resolveLocal") return pin;
    if (method === "workspaceTemplateSource.inspectExact") {
      return { pin, repositories: [], dependencies: [] };
    }
    throw new Error(`Unexpected method: ${method}`);
  });
  const api = await activate({
    storage: { root: process.cwd() },
    log: { info: vi.fn() },
    rpc: schemaRpcMock({ call }),
  } as never);

  await expect(api.inspect({ url: pin.url })).resolves.toMatchObject({ pin });
  expect(call).toHaveBeenNthCalledWith(
    1,
    "main",
    "workspaceTemplateSource.resolveLocal",
    [pin.url],
    undefined,
  );
  expect(call).toHaveBeenNthCalledWith(
    2,
    "main",
    "workspaceTemplateSource.inspectExact",
    [pin],
    undefined,
  );
});

it("loads the instance registry by default", async () => {
  const registry = {
    version: 1 as const,
    templates: [
      ...(["base", "personal", "system"] as const).map((role) => ({
        id: role,
        role,
        name: role,
        description: `${role} workspace`,
        url: `git+https://example.test/${role}.git`,
      })),
    ],
  };
  const call = vi.fn(async (_target: string, method: string) =>
    method === "workspaceTemplateSource.localRegistry" ? registry : null,
  );
  const api = await activate({
    storage: { root: process.cwd() },
    log: { info: vi.fn() },
    rpc: schemaRpcMock({ call }),
  } as never);

  await expect(api.registry({})).resolves.toEqual(registry);
  expect(call).toHaveBeenCalledWith(
    "main",
    "workspaceTemplateSource.localRegistry",
    [],
    undefined,
  );
});

it("checks every tag page using the chosen account before suggesting a version", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(Array.from({ length: 100 }, () => ({ name: "v1.0.0" }))),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "v2.4.9" }])));
  const forAudience = vi.fn(async () => ({ fetch }));
  const api = await activate({
    storage: { root: process.cwd() },
    log: { info: vi.fn() },
    rpc: schemaRpcMock({ call: vi.fn(async () => undefined) }),
    credentials: { forAudience },
  } as never);
  await expect(
    api.publicationVersion({
      owner: "team",
      name: "personal",
      credentialId: "selected",
    }),
  ).resolves.toEqual({ latest: "2.4.9", suggested: "2.4.10" });
  expect(forAudience).toHaveBeenCalledWith(
    expect.objectContaining({ credentialId: "selected" }),
  );
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    "https://api.github.com/repos/team/personal/tags?per_page=100&page=1",
    "https://api.github.com/repos/team/personal/tags?per_page=100&page=2",
  ]);
});

it("reports inaccessible tags instead of suggesting an unverified first release", async () => {
  const api = await activate({
    storage: { root: process.cwd() },
    log: { info: vi.fn() },
    rpc: schemaRpcMock({ call: vi.fn(async () => undefined) }),
    credentials: {
      forAudience: async () => ({
        fetch: async () => new Response("Access denied", { status: 403 }),
      }),
    },
  } as never);
  await expect(
    api.publicationVersion({
      owner: "team",
      name: "personal",
      credentialId: "selected",
    }),
  ).rejects.toThrow("403");
});

it("derives inherited ownership from the pinned source tree without a manifest inventory", async () => {
  const pin = {
    url: "https://example.test/base.git",
    ref: "refs/heads/main",
    commit: "c".repeat(40),
  };
  const { parseTemplateManifestContent } =
    await import("@vibestudio/workspace/templateManifest");
  const installation = { sources: [{ pin, manifest: "systemEpoch: 0\n" }] };
  const manifest = parseTemplateManifestContent(
    JSON.stringify({
      systemEpoch: 0,
      template: {
        name: "Mine",
        dependencies: [{ url: pin.url }],

      },
    }),
    0,
  );
  const workspace = await import("./workspace.js");
  const observe = vi
    .spyOn(workspace, "observeWorkspace")
    .mockResolvedValueOnce({
      manifest,
      installation,
      localRepoPaths: new Set(["meta", "panels/inherited", "projects/local"]),
    } as never);
  try {
    const call = vi.fn(async (_target: string, method: string, args: unknown[]) => {
      if (method !== "workspaceTemplateSource.inspectExact")
        throw new Error(`Unexpected method: ${method}`);
      const inspectedPin = args[0];
      expect(inspectedPin).toEqual(pin);
      return {
        pin,
        repositories: ["meta", "panels/inherited"],
        dependencies: [],
      };
    });
    const api = await activate({
      storage: { root: process.cwd() },
      log: { info: vi.fn() },
      rpc: schemaRpcMock({ call }),
    } as never);
    const setup = await api.authoringSetup();
    expect(setup.parts).toEqual([
      {
        repoPath: "panels/inherited",
        ownership: "inherited",
        inheritedFrom: pin.url,
      },
      { repoPath: "projects/local", ownership: "authored" },
    ]);
    expect(call).toHaveBeenCalledOnce();
  } finally {
    observe.mockRestore();
  }
});
