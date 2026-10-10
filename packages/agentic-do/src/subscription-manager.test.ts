import { describe, expect, it, vi } from "vitest";
import { createInMemorySql } from "@workspace/runtime/worker/test-utils";
import type { SqlStorage } from "@workspace/runtime/worker";
import type { ChannelClient } from "./channel-client.js";
import { DOIdentity } from "./identity.js";
import { SubscriptionManager } from "./subscription-manager.js";

async function makeManager(channel: Partial<ChannelClient>) {
  const sql = (await createInMemorySql()) as unknown as SqlStorage;
  const identity = new DOIdentity(sql);
  identity.createTables();
  identity.bootstrap(
    {
      source: "workers/test-agent",
      className: "TestAgentWorker",
      objectKey: "agent-1",
    },
    "session-1",
  );
  const manager = new SubscriptionManager(
    sql,
    () => channel as ChannelClient,
    identity,
  );
  manager.createTables();
  return manager;
}

const descriptor = { name: "Test", type: "agent" as const, handle: "test" };

describe("SubscriptionManager finite relationships", () => {
  it("persists membership only after the channel acknowledges join", async () => {
    const join = vi.fn().mockRejectedValue(new Error("join rejected"));
    const manager = await makeManager({
      join,
      relationshipState: vi.fn().mockResolvedValue(null),
    });

    await expect(
      manager.subscribe({
        channelId: "ch-1",
        channelRef: {
          source: "workers/pubsub-channel",
          className: "PubSubChannel",
          objectKey: "ch-1",
        },
        contextId: "ctx-1",
        descriptor,
      }),
    ).rejects.toThrow("join rejected");
    expect(manager.listAll()).toEqual([]);
  });

  it("retains prepared join operation across external acceptance and local materialization loss", async () => {
    const original = new Error("Join response lost");
    let lose = true;
    const join = vi.fn(async (input) => {
      if (lose) {
        lose = false;
        throw original;
      }
      return {
        ok: true,
        participantId: input.participantId,
        revision: 1,
      };
    });
    const manager = await makeManager({
      join,
      relationshipState: vi.fn().mockResolvedValue(null),
    });
    const prepared = await manager.prepareSubscription({
      channelId: "ch-1",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "ch-1",
      },
      contextId: "ctx-1",
      descriptor,
    });
    expect(join).not.toHaveBeenCalled();
    expect(manager.count()).toBe(0);
    await expect(manager.joinPrepared(prepared)).rejects.toBe(original);
    expect(manager.count()).toBe(0);
    await manager.joinPrepared(JSON.parse(JSON.stringify(prepared)));
    expect(join.mock.calls[0]![0].operationId).toBe(
      join.mock.calls[1]![0].operationId,
    );
    expect(manager.getContextId("ch-1")).toBe("ctx-1");
  });

  it("keeps an identical retry at the same relationship revision", async () => {
    const join = vi.fn().mockImplementation(async () => ({
      ok: true,
      participantId: "agent-1",
      revision: 1,
    }));
    const manager = await makeManager({
      join,
      relationshipState: vi.fn().mockResolvedValue(null),
    });

    const input = {
      channelId: "ch-1",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "ch-1",
      },
      contextId: "ctx-1",
      descriptor,
    };
    await manager.subscribe(input);
    await manager.subscribe(input);

    expect(join.mock.calls[0]![0].operationId).toBe(
      join.mock.calls[1]![0].operationId,
    );
    expect(manager.count()).toBe(1);
  });

  it("creates a new operation when relationship semantics change", async () => {
    const join = vi.fn().mockImplementation(async () => ({
      ok: true,
      participantId: "agent-1",
      revision: 1,
    }));
    const manager = await makeManager({
      join,
      relationshipState: vi.fn().mockResolvedValue(null),
    });

    await manager.subscribe({
      channelId: "ch-1",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "ch-1",
      },
      contextId: "ctx-1",
      descriptor,
    });
    await manager.subscribe({
      channelId: "ch-1",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "ch-1",
      },
      contextId: "ctx-2",
      descriptor,
      config: { wakePolicy: "turn-final" },
    });

    expect(join.mock.calls[0]![0].operationId).not.toBe(
      join.mock.calls[1]![0].operationId,
    );
    expect(manager.getContextId("ch-1")).toBe("ctx-2");
  });

  it("accepts the channel-owned revision without a relationship preflight", async () => {
    const join = vi.fn().mockImplementation(async () => ({
      ok: true,
      participantId: "agent-1",
      revision: 9,
    }));
    const relationshipState = vi
      .fn()
      .mockResolvedValue({ revision: 8, active: false });
    const manager = await makeManager({ join, relationshipState });

    await manager.subscribe({
      channelId: "ch-1",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "ch-1",
      },
      contextId: "ctx-1",
      descriptor,
    });

    expect(relationshipState).not.toHaveBeenCalled();
    expect(join.mock.calls[0]![0]).not.toHaveProperty("revision");
    // The actual allocated revision is retained locally for the later leave.
    expect(manager.listStored()[0]!.revision).toBe(9);
  });

  it("deletes local membership only after finite leave is acknowledged", async () => {
    const leave = vi.fn().mockResolvedValue(undefined);
    const manager = await makeManager({
      join: vi.fn().mockImplementation(async () => ({
        ok: true,
        participantId: "agent-1",
        revision: 1,
      })),
      leave,
      relationshipState: vi.fn().mockResolvedValue(null),
    });
    await manager.subscribe({
      channelId: "ch-1",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "ch-1",
      },
      contextId: "ctx-1",
      descriptor,
    });

    await manager.unsubscribeFromChannel("ch-1");

    expect(leave).toHaveBeenCalledWith(expect.stringContaining("agent-1"), 1);
    expect(manager.listAll()).toEqual([]);
  });

  it("preserves a newer acknowledged opening when an older owner's close finishes", async () => {
    let finishLeave!: () => void;
    let enteredLeave!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredLeave = resolve;
    });
    const leave = vi.fn(async () => {
      enteredLeave();
      await new Promise<void>((resolve) => {
        finishLeave = resolve;
      });
    });
    let revision = 0;
    const manager = await makeManager({
      join: vi.fn(async () => ({
        ok: true,
        participantId: "agent-1",
        revision: ++revision,
      })),
      leave,
    });
    const input = {
      channelId: "ch-1",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "ch-1",
      },
      contextId: "ctx-1",
      descriptor,
    };
    await manager.subscribe(input);
    const closing = manager.unsubscribeFromChannel("ch-1");
    await entered;
    await manager.subscribe({ ...input, config: { handle: "replacement" } });
    finishLeave();
    await closing;
    expect(leave).toHaveBeenCalledWith(expect.any(String), 1);
    expect(manager.listStored()[0]!.revision).toBe(2);
    expect(manager.getConfig("ch-1")).toEqual({ handle: "replacement" });
  });

  it("distinguishes reasoning memberships from addressed-only supervision", async () => {
    const join = vi.fn().mockImplementation(async () => ({
      ok: true,
      participantId: "agent-1",
      revision: 1,
    }));
    const manager = await makeManager({
      join,
      relationshipState: vi.fn().mockResolvedValue(null),
    });

    await manager.subscribe({
      channelId: "work",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "work",
      },
      contextId: "ctx-1",
      descriptor,
      delivery: "all",
    });
    await manager.subscribe({
      channelId: "supervised-task",
      channelRef: {
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "supervised-task",
      },
      contextId: "ctx-2",
      descriptor,
      delivery: "addressed",
    });

    expect(manager.ownsReasoningLoop("work")).toBe(true);
    expect(manager.ownsReasoningLoop("supervised-task")).toBe(false);
    expect(manager.ownsReasoningLoop("missing")).toBe(false);
    expect(join.mock.calls[1]![0]).toMatchObject({
      metadata: { type: "observer" },
    });
  });
});
