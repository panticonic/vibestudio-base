import { describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { createGadClient } from "./gad.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

describe("createGadClient", () => {
  it("routes finite GAD inspection methods through the declared workspace service", async () => {
    const rpc = schemaRpcMock({
      call: vi.fn(async (target: string, method: string) => {
        if (target === "main" && method === "workers.resolveService") {
          return durableObjectServiceFixture("do:workers/workspace-source:GadWorkspaceDO:workspace", { source: "vibestudio/internal",
            className: "GadWorkspaceDO",
            objectKey: "workspace" });
        }
        if (
          method === "listTrajectoryBranches" ||
          method === "listTrajectoryInvocations"
        ) {
          return [];
        }
        return undefined;
      }),
      stream: vi.fn(),
    });
    const gad = createGadClient(rpc as never);

    await gad.listTrajectoryBranches({ limit: 10 });
    await gad.listTrajectoryInvocations({ branchId: "branch-1", limit: 20 });

    expect(rpc.call).toHaveBeenNthCalledWith(
      1,
      "main",
      "workers.resolveService",
      ["vibestudio.gad.workspace.v1", null],
      undefined,
    );
    expect(rpc.call).toHaveBeenNthCalledWith(
      2,
      "do:workers/workspace-source:GadWorkspaceDO:workspace",
      "listTrajectoryBranches",
      [{ limit: 10 }],
      undefined,
    );
    expect(rpc.call).toHaveBeenNthCalledWith(
      3,
      "do:workers/workspace-source:GadWorkspaceDO:workspace",
      "listTrajectoryInvocations",
      [{ branchId: "branch-1", limit: 20 }],
      undefined,
    );
  });

  it("keeps semantic envelope reads hydrated while inspection stays compact", async () => {
    const digest = "a".repeat(64);
    const ref = {
      protocol: "vibestudio.blob-ref.v1",
      digest,
      size: 15,
      encoding: "json",
      originalBytes: 15,
    };
    const rpc = schemaRpcMock({
      call: vi.fn(async (target: string, method: string) => {
        if (target === "main" && method === "workers.resolveService") {
          return durableObjectServiceFixture("do:workers/workspace-source:GadWorkspaceDO:workspace", { source: "vibestudio/internal",
            className: "GadWorkspaceDO",
            objectKey: "workspace" });
        }
        if (target === "main" && method === "blobstore.getText") {
          return JSON.stringify({ hydrated: true });
        }
        if (method === "readChannelEnvelopes") {
          return {
            pageInfo: {
              request: { window: { kind: "tail" }, limit: 50 },
              returnedCount: 1,
              totalCount: 1,
              firstSeq: 1,
              lastSeq: 1,
              snapshotLastSeq: 1,
              returnedFromSeq: 1,
              returnedToSeq: 1,
              hasMoreBefore: false,
              hasMoreAfter: false,
            },
            items: [
              {
                envelopeId: "env-1",
                channelId: "channel-1",
                seq: 1,
                from: { kind: "panel", id: "panel:user" },
                payloadKind: "custom.kind",
                contentClass: "internal",
                externalKeys: [],
                payload: ref,
                publishedAt: "2026-05-20T12:00:00.000Z",
              },
            ],
          };
        }
        if (method === "inspectChannelEnvelopes") {
          return {
            pageInfo: {
              request: { window: { kind: "tail" }, limit: 50 },
              returnedCount: 1,
              totalCount: 1,
              firstSeq: 1,
              lastSeq: 1,
              snapshotLastSeq: 1,
              returnedFromSeq: 1,
              returnedToSeq: 1,
              hasMoreBefore: false,
              hasMoreAfter: false,
            },
            items: [
              {
                envelopeId: "env-1",
                channelId: "channel-1",
                seq: 1,
                payloadKind: "custom.kind",
                from: { kind: "panel", id: "panel:user" },
                bytes: {
                  from: 1,
                  to: 0,
                  payload: 1,
                  metadata: 0,
                  attachments: 0,
                },
                payloadSummary: ref,
                storedRefs: [],
                publishedAt: "2026-05-20T12:00:00.000Z",
              },
            ],
          };
        }
        return { rows: [] };
      }),
      stream: vi.fn(),
    });
    const gad = createGadClient(rpc as never);

    await expect(
      gad.readChannelEnvelopes({
        channelId: "channel-1",
        window: { kind: "tail" },
      }),
    ).resolves.toMatchObject({ items: [{ payload: { hydrated: true } }] });
    await expect(
      gad.inspectChannelEnvelopes({ channelId: "channel-1" }),
    ).resolves.toMatchObject({
      items: [{ envelopeId: "env-1", payloadSummary: ref }],
    });
  });

  it("routes agent inspection to the channel's own inspectAgent receiver", async () => {
    const channelTarget = "do:workers/pubsub-channel:PubSubChannel:channel-2";
    const inspection = {
      participantId: "do:workers/agent-worker:AiChatWorker:agent-1",
      channelId: "channel-2",
      method: "getDebugState",
      result: { loaded: false },
      roster: { present: true, transport: "do" },
    };
    const rpc = schemaRpcMock({
      call: vi.fn(async (target: string, method: string) => {
        if (target === "main" && method === "workers.resolveService") {
          return durableObjectServiceFixture(channelTarget, { source: "workers/pubsub-channel",
            className: "PubSubChannel",
            objectKey: "channel-2" });
        }
        if (target === channelTarget && method === "inspectAgent")
          return inspection;
        throw new Error(`unexpected call ${target}.${method}`);
      }),
      stream: vi.fn(),
    });
    const gad = createGadClient(rpc as never);

    await expect(
      gad.inspectAgent({ channelId: "channel-2", method: "getDebugState" }),
    ).resolves.toEqual(inspection);
    expect(rpc.call).toHaveBeenNthCalledWith(
      1,
      "main",
      "workers.resolveService",
      ["vibestudio.channel.v1", "channel-2"],
      undefined,
    );
    expect(rpc.call).toHaveBeenNthCalledWith(
      2,
      channelTarget,
      "inspectAgent",
      [{ method: "getDebugState" }],
      undefined,
    );
    expect(gad.collectChannelEnvelopePages).toBeTypeOf("function");
  });

  it("exposes typed durable user-notification consumer and producer calls", async () => {
    const targetId = "do:workers/workspace-source:GadWorkspaceDO:workspace";
    const rpc = schemaRpcMock({
      call: vi.fn(async (target: string, method: string, args: unknown[]) => {
        if (target === "main" && method === "workers.resolveService") {
          return durableObjectServiceFixture(targetId, {
            source: "vibestudio/internal",
            className: "GadWorkspaceDO",
            objectKey: "workspace",
          });
        }
        if (method === "listUserNotificationsForMe") {
          return {
            notifications: [
              {
                id: "channel.invite:channel-1",
                userId: "usr_bob",
                kind: "channel.invite",
                title: "Channel invitation",
                createdAt: 1,
                revision: 1,
              },
            ],
          };
        }
        if (method === "acknowledgeUserNotification")
          return { acknowledged: true };
        if (method === "putUserNotification") return args[0];
        if (method === "deleteUserNotification") return { deleted: true };
        throw new Error(`unexpected call ${target}.${method}`);
      }),
      stream: vi.fn(),
    });
    const gad = createGadClient(rpc as never);

    await expect(gad.listUserNotificationsForMe()).resolves.toMatchObject([
      { id: "channel.invite:channel-1", userId: "usr_bob" },
    ]);
    await expect(
      gad.acknowledgeUserNotification("channel.invite:channel-1"),
    ).resolves.toBe(true);
    const generic = {
      id: "build:42",
      userId: "usr_bob",
      kind: "build.completed",
      title: "Build complete",
      createdAt: 42,
      revision: 1,
    };
    await expect(gad.putUserNotification(generic)).resolves.toEqual(generic);
    await expect(
      gad.deleteUserNotification("usr_bob", "build:42"),
    ).resolves.toBe(true);
    expect(rpc.call).toHaveBeenCalledWith(
      targetId,
      "listUserNotificationsForMe",
      [],
      undefined,
    );
    expect(rpc.call).toHaveBeenCalledWith(
      targetId,
      "acknowledgeUserNotification",
      [{ id: "channel.invite:channel-1" }],
      undefined,
    );
    expect(rpc.call).toHaveBeenCalledWith(targetId, "putUserNotification", [
      generic,
    ], undefined);
    expect(rpc.call).toHaveBeenCalledWith(targetId, "deleteUserNotification", [
      { userId: "usr_bob", id: "build:42" },
    ], undefined);
  });
});
