import { describe, expect, it, vi } from "vitest";
import { RemoteRpcError } from "@vibestudio/rpc";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { vcsMethods } from "@vibestudio/service-schemas/vcs";
import { createVcsClient } from "./vcsClient.js";

function rpcFor(call: (method: string, ...args: unknown[]) => Promise<unknown>) {
  return schemaRpcMock({
    call: async (_target: string, method: string, args: unknown[]) =>
      call(method, ...args),
  });
}

describe("createVcsClient", () => {
  it("exposes the schema-owned method roster plus the publication composite", () => {
    const client = createVcsClient(rpcFor(async () => null), "context:bound");
    expect(Object.keys(client).sort()).toEqual([...Object.keys(vcsMethods), "publish"].sort());
  });

  it("mints one fresh command identity per logical mutation call", async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({
      contextId: "context:bound",
      workingHead: { kind: "event", eventId: "event:committed" },
      discardedApplicationIds: [],
    }));
    const client = createVcsClient(rpcFor(call), "context:bound");
    const expectedWorkingHead = { kind: "event" as const, eventId: "event:committed" };

    await client.discard({ expectedWorkingHead });
    await client.discard({ expectedWorkingHead });

    const first = call.mock.calls[0]![1] as { commandId: string };
    const second = call.mock.calls[1]![1] as { commandId: string };
    expect(first).toMatchObject({ contextId: "context:bound", expectedWorkingHead });
    expect(first.commandId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(second.commandId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(second.commandId).not.toBe(first.commandId);
  });

  it("keeps an explicit command identity and mints one for an explicit undefined", async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({
      contextId: "context:bound",
      workingHead: { kind: "event", eventId: "event:committed" },
      discardedApplicationIds: [],
    }));
    const client = createVcsClient(rpcFor(call), "context:bound");
    const expectedWorkingHead = { kind: "event" as const, eventId: "event:committed" };

    await client.discard({ expectedWorkingHead, commandId: "invocation:1" });
    await client.discard({ expectedWorkingHead, commandId: undefined });

    expect(call.mock.calls[0]![1]).toMatchObject({ commandId: "invocation:1" });
    expect((call.mock.calls[1]![1] as { commandId: string }).commandId).toMatch(
      /^[0-9a-f-]{36}$/u
    );
  });

  it("never adds a command identity to reads", async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({
      contextId: "context:bound",
      committed: { kind: "event", eventId: "event:committed" },
      workingHead: { kind: "event", eventId: "event:committed" },
      clean: true,
      mainEventId: "event:committed",
      mainRelation: "at",
      workingCounts: { applications: 0, workUnits: 0, changes: 0 },
      integrating: [],
    }));
    const client = createVcsClient(rpcFor(call), "context:bound");

    await client.status();

    expect(call).toHaveBeenCalledWith("vcs.status", { contextId: "context:bound" });
  });

  it("preserves the zero-argument mainState contract", async () => {
    const result = { kind: "event" as const, eventId: "event:main" };
    const call = vi.fn(async (..._args: unknown[]) => result);
    const client = createVcsClient(rpcFor(call), "context:bound");

    await expect(client.mainState()).resolves.toEqual(result);
    expect(call).toHaveBeenCalledWith("vcs.mainState");

    await expect(
      (client.mainState as (input: unknown) => Promise<unknown>)({})
    ).rejects.toThrow('Service "vcs" method "mainState" arguments failed schema validation');
    expect(call).toHaveBeenCalledTimes(1);
  });

  describe("publish", () => {
    const status = (overrides: Record<string, unknown>) => ({
      contextId: "context:bound",
      committed: { kind: "event", eventId: "event:committed" },
      workingHead: { kind: "event", eventId: "event:committed" },
      clean: true,
      mainEventId: "event:main",
      mainRelation: "ahead",
      workingCounts: { applications: 0, workUnits: 0, changes: 0 },
      integrating: [],
      ...overrides,
    });
    const pushResult = {
      contextId: "context:bound",
      eventId: "event:new",
      mainEventId: "event:new",
      effectId: "effect:1",
      appliedAt: "2026-07-24T00:00:00.000Z",
    };

    it("commits a dirty chain and pushes it against the observed main", async () => {
      const call = vi.fn(async (method: string, ..._args: unknown[]) => {
        if (method === "vcs.status")
          return status({
            clean: false,
            workingHead: { kind: "application", applicationId: "application:1" },
          });
        if (method === "vcs.commit")
          return {
            contextId: "context:bound",
            event: { kind: "event", eventId: "event:new" },
            committedApplicationIds: ["application:1"],
            integrationSourceEventIds: [],
          };
        return pushResult;
      });
      const client = createVcsClient(rpcFor(call), "context:bound");

      const result = await client.publish({ message: "Ship the change" });

      expect(result).toMatchObject({ status: "published", push: pushResult });
      expect(call.mock.calls.map(([method]) => method)).toEqual([
        "vcs.status",
        "vcs.commit",
        "vcs.push",
      ]);
      expect(call.mock.calls[1]![1]).toMatchObject({
        contextId: "context:bound",
        expectedWorkingHead: { kind: "application", applicationId: "application:1" },
        message: "Ship the change",
      });
      expect(call.mock.calls[2]![1]).toMatchObject({
        contextId: "context:bound",
        expectedCommittedEventId: "event:new",
        expectedMainEventId: "event:main",
      });
      const commandIds = [call.mock.calls[1]![1], call.mock.calls[2]![1]].map(
        (input) => (input as { commandId: string }).commandId
      );
      expect(new Set(commandIds).size).toBe(2);
    });

    it("pushes a clean committed event without committing", async () => {
      const call = vi.fn(async (method: string, ..._args: unknown[]) =>
        method === "vcs.status" ? status({}) : pushResult
      );
      const client = createVcsClient(rpcFor(call), "context:bound");

      await expect(client.publish()).resolves.toMatchObject({ status: "published", commit: null });
      expect(call.mock.calls.map(([method]) => method)).toEqual(["vcs.status", "vcs.push"]);
      expect(call.mock.calls[1]![1]).toMatchObject({
        expectedCommittedEventId: "event:committed",
        expectedMainEventId: "event:main",
      });
    });

    it.each(["behind", "diverged"] as const)(
      "returns IntegrationRequired without merging when main is %s",
      async (mainRelation) => {
        const call = vi.fn(async (_method: string, ..._args: unknown[]) =>
          status({ mainRelation, clean: false })
        );
        const client = createVcsClient(rpcFor(call), "context:bound");

        await expect(client.publish({ message: "Ship" })).resolves.toEqual({
          status: "integration-required",
          code: "IntegrationRequired",
          contextId: "context:bound",
          mainRelation,
          mainEventId: "event:main",
          compare: {
            target: { kind: "event", eventId: "event:committed" },
            source: { kind: "event", eventId: "event:main" },
          },
        });
        expect(call.mock.calls.map(([method]) => method)).toEqual(["vcs.status"]);
      }
    );
  });

  it("dispatches one canonical request without a routing overlay", async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({
      contextId: "context:1",
      committed: { kind: "event", eventId: "event:committed" },
      workingHead: { kind: "event", eventId: "event:committed" },
      clean: true,
      mainEventId: "event:committed",
      mainRelation: "at",
      workingCounts: { applications: 0, workUnits: 0, changes: 0 },
      integrating: [],
    }));
    const client = createVcsClient(rpcFor(call), "context:bound");

    await client.status({ contextId: "context:1" });

    expect(call).toHaveBeenCalledWith("vcs.status", { contextId: "context:1" });
  });

  it("binds omitted context to the runtime's semantic context", async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({
      contextId: "context:bound",
      committed: { kind: "event", eventId: "event:committed" },
      workingHead: { kind: "event", eventId: "event:committed" },
      clean: true,
      mainEventId: "event:committed",
      mainRelation: "at",
      workingCounts: { applications: 0, workUnits: 0, changes: 0 },
      integrating: [],
    }));
    const client = createVcsClient(rpcFor(call), "context:bound");

    await client.status();

    expect(call).toHaveBeenCalledWith("vcs.status", { contextId: "context:bound" });
  });

  it("binds context only for methods whose schema declares a context reference", async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({
      root: { kind: "event", eventId: "event:committed" },
      node: {
        kind: "event",
        value: {
          eventId: "event:committed",
          workspaceId: "workspace:1",
          commandId: "command:1",
          kind: "commit",
          workspaceFactRootId: "fact:1",
          snapshotSource: null,
          parentEventIds: [],
          applicationIds: [],
          decisionIds: [],
          message: null,
          semanticProtocol: "semantic-vcs-v1",
          createdAt: "2026-07-24T00:00:00.000Z",
        },
      },
      edges: [],
      hasMoreEdges: false,
    }));
    const client = createVcsClient(rpcFor(call), "context:bound");

    await client.inspect({
      node: { kind: "event", eventId: "event:committed" },
      edgeLimit: 1,
    });

    expect(call).toHaveBeenCalledWith("vcs.inspect", {
      node: { kind: "event", eventId: "event:committed" },
      edgeLimit: 1,
    });
  });

  it("allows context-bound mutations to omit only their context identity", async () => {
    const call = vi.fn(async (..._args: unknown[]) => ({
      contextId: "context:bound",
      workingHead: { kind: "event", eventId: "event:committed" },
      discardedApplicationIds: [],
    }));
    const client = createVcsClient(rpcFor(call), "context:bound");

    await client.discard({
      commandId: "command:discard",
      expectedWorkingHead: { kind: "event", eventId: "event:committed" },
    });

    expect(call).toHaveBeenCalledWith("vcs.discard", {
      contextId: "context:bound",
      commandId: "command:discard",
      expectedWorkingHead: { kind: "event", eventId: "event:committed" },
    });
  });

  it("preserves typed service refusals", async () => {
    const errorData = {
      code: "RevisionChanged",
      message: "Working head changed",
      expected: { kind: "event" as const, eventId: "event:observed" },
      actual: { kind: "application" as const, applicationId: "application:current" },
    };
    const refusal = new RemoteRpcError(errorData.message, "application", errorData.code, errorData);
    const client = createVcsClient(
      rpcFor(async () => {
        throw refusal;
      }),
      "context:bound",
    );

    const rejected = await client
      .discard({
        contextId: "context:1",
        expectedWorkingHead: errorData.expected,
        commandId: "command:discard",
      })
      .catch((error) => error);

    expect(rejected).toBe(refusal);
    expect(rejected).toMatchObject({ code: "RevisionChanged", errorData });
  });
});
