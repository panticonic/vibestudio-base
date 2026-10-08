import { describe, expect, it, vi } from "vitest";
import {
  createShellTemplateManagementClient,
  createTemplateManagementClient,
} from "./index.js";

describe("template management client", () => {
  it("exposes only retained upstream operations through the templates extension", async () => {
    const invoke = vi.fn().mockImplementation(async (_extension, method) =>
      method === "inspect"
        ? {
            pin: {
              url: "https://example.com/base.git",
              ref: "refs/tags/v1",
              commit: "1".repeat(40),
            },
            repositories: [],
            dependencies: [],
          }
        : method === "authoringParts"
          ? []
          : null,
    );
    const client = createTemplateManagementClient(invoke);
    await client.inspect({ url: "https://example.com/base.git" });
    await client.authoringParts();
    expect(invoke.mock.calls.map(([, method]) => method)).toEqual([
      "inspect",
      "authoringParts",
    ]);
    expect(
      invoke.mock.calls.every(
        ([extension]) => extension === "@workspace-extensions/templates",
      ),
    ).toBe(true);
  });
});

it("resolves moving URLs once and sends every exact pin to the host owner", async () => {
  const pin = {
    url: "https://example.invalid/dirty.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const invoke = vi.fn(async (_extension, method) => {
    if (method === "resolveSource") return pin;
    throw new Error(`Unexpected extension method: ${method}`);
  });
  const callHost = vi.fn(async () => ({
    pin,
    repositories: [],
    dependencies: [],
  }));
  const client = createShellTemplateManagementClient(invoke, callHost);

  await client.inspect({ url: pin.url });
  await client.inspect({ pin });

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith(
    "@workspace-extensions/templates",
    "resolveSource",
    [{ url: pin.url }],
  );
  expect(callHost).toHaveBeenNthCalledWith(
    1,
    "workspaceTemplateSource",
    "inspectExact",
    [pin],
  );
  expect(callHost).toHaveBeenNthCalledWith(
    2,
    "workspaceTemplateSource",
    "inspectExact",
    [pin],
  );
});

it("explains readiness, exact app requirements, and retained hosts without exposing epochs", async () => {
  const { templateUpdateCompatibility } = await import("./index");
  const source = {
    url: "https://example.test/base.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const check = {
    source,
    checkedAt: 1,
    status: "different-epoch" as const,
    targetEpoch: 0,
    targetMinimumAppVersion: "0.1.84",
    targetAppVersion: "0.1.84",
  };
  expect(
    templateUpdateCompatibility(check, {
      workspaceAppVersion: "1.0.0",
      currentAppVersion: "1.0.0",
    }),
  ).toEqual({
    state: "ready",
    message: "Uses retained host Vibestudio 0.1.84. Ready to review.",
  });
  expect(
    templateUpdateCompatibility(
      { ...check, targetAppVersion: "0.1.83" },
      { currentAppVersion: "1.0.0" },
    ),
  ).toMatchObject({
    state: "host-unavailable",
    message: expect.stringContaining("Requires Vibestudio 0.1.84"),
  });
  expect(
    templateUpdateCompatibility(
      { ...check, status: "available" },
      { currentAppVersion: "0.1.84" },
    ),
  ).toEqual({ state: "ready", message: "Ready to review with an agent." });
});

it("distinguishes a missing matching host from a release that needs updating", async () => {
  const { templateUpdateCompatibility } = await import("./index");
  const check = {
    source: {
      url: "https://example.test/base.git",
      ref: "refs/heads/main",
      commit: "a".repeat(40),
    },
    checkedAt: 1,
    status: "different-epoch" as const,
    targetEpoch: 1,
    targetMinimumAppVersion: "1.2.0",
    hostError: "Retained host is missing",
  };
  expect(
    templateUpdateCompatibility(check, {
      workspaceAppVersion: "0.1.84",
      currentAppVersion: "2.0.0",
    }),
  ).toMatchObject({
    state: "host-unavailable",
    message: expect.stringContaining(
      "compatible workspace host is unavailable",
    ),
  });
  expect(
    templateUpdateCompatibility(check, {
      workspaceAppVersion: "0.1.84",
      currentAppVersion: "0.1.84",
    }),
  ).toMatchObject({ state: "app-update-required" });
  expect(
    templateUpdateCompatibility(
      { ...check, targetAppVersion: "1.1.0", hostError: undefined },
      {
        workspaceAppVersion: "0.1.84",
        currentAppVersion: "2.0.0",
      },
    ),
  ).toMatchObject({ state: "host-unavailable" });
  expect(
    templateUpdateCompatibility(check, {
      workspaceAppVersion: "0.1.84",
      currentAppVersion: "1.1.0",
    }),
  ).toMatchObject({ state: "app-update-required" });
  expect(
    templateUpdateCompatibility(check, {
      workspaceAppVersion: "0.1.84",
      currentAppVersion: "1.2.0",
    }),
  ).toEqual({ state: "ready", message: "Ready to review with an agent." });
});
