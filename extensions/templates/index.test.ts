import { describe, expect, it, vi } from "vitest";
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
    files: ["package.json"],
    dependencies: [],
  };
  const call = vi.fn(async () => inspected);
  const api = await activate({
    log: { info: vi.fn() },
    rpc: { call },
  } as never);

  await expect(api.inspect({ pin })).resolves.toEqual(inspected);
  expect(call).toHaveBeenCalledWith(
    "main",
    "workspaceTemplateSource.inspectExact",
    pin,
  );
});

it("prefers an instance-designated checkpoint to remote discovery", async () => {
  const pin = {
    url: "git+https://example.invalid/local.git",
    ref: "refs/heads/vibestudio-dev-checkpoint",
    commit: "b".repeat(40),
  };
  const call = vi.fn(async (_target, method) => {
    if (method === "workspaceTemplateSource.resolveLocal") return pin;
    if (method === "workspaceTemplateSource.inspectExact") {
      return { pin, repositories: [], files: [], dependencies: [] };
    }
    throw new Error(`Unexpected method: ${method}`);
  });
  const api = await activate({
    log: { info: vi.fn() },
    rpc: { call },
  } as never);

  await expect(api.inspect({ url: pin.url })).resolves.toMatchObject({ pin });
  expect(call).toHaveBeenNthCalledWith(
    1,
    "main",
    "workspaceTemplateSource.resolveLocal",
    pin.url,
  );
  expect(call).toHaveBeenNthCalledWith(
    2,
    "main",
    "workspaceTemplateSource.inspectExact",
    pin,
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
  const call = vi.fn(async (_target, method) =>
    method === "workspaceTemplateSource.localRegistry" ? registry : null,
  );
  const api = await activate({
    log: { info: vi.fn() },
    rpc: { call },
  } as never);

  await expect(api.registry({})).resolves.toEqual(registry);
  expect(call).toHaveBeenCalledWith(
    "main",
    "workspaceTemplateSource.localRegistry",
  );
});
