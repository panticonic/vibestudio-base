import { describe, expect, it, vi } from "vitest";
import { createModels, fauxProvider } from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import { createRegistry, WakeDoc } from "@panticonic/pi-durable";
import { rpc, serializeRpcFailure, type RpcEnvelope } from "@vibestudio/rpc";
import type { ParticipantDescriptor } from "@workspace/harness";
import type {
  LifecyclePrepareInput,
  LifecyclePrepareResult,
} from "@workspace/runtime/worker/durable-base";
import { AgentVesselBase } from "./agent-vessel.js";
import type { NativeAgentOptions } from "./native-agent-owner.js";
import { createNativeVesselTestDO } from "./testing/native-vessel.js";
import {
  lookupNativeChannelConversation,
  openNativeChannelConversation,
} from "./native-channel-session.js";

async function releaseAcrossPhases(
  instance: AlarmOwnershipVessel,
  input: Omit<LifecyclePrepareInput, "phase">,
): Promise<LifecyclePrepareResult> {
  let result: LifecyclePrepareResult = { status: "ready" };
  for (const phase of ["quiesce", "peer-obligations", "release"] as const) {
    result = await instance.releaseForLifecycle({ ...input, phase });
    if (result.status === "failed") return result;
  }
  return result;
}

class AlarmOwnershipVessel extends AgentVesselBase {
  readonly models = createModels();

  protected override getParticipantInfo(): ParticipantDescriptor {
    return {
      type: "agent",
      name: "Alarm ownership",
      handle: "alarm-ownership",
    };
  }

  protected override agentOptions(): NativeAgentOptions {
    return {
      registry: createRegistry(),
      models: this.models,
      modelRequests: async () => {
        throw new Error(
          "Passive schedule operations must not prepare a model request",
        );
      },
    };
  }

  open() {
    return this.agentSession();
  }

  @rpc({
    website: { kind: "closed", reason: "Passive schedule ownership fixture." },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  inspectPassiveState(): string {
    return "ready";
  }
}

describe("native vessel alarm ownership", () => {
  it("publishes changed schedules once, retains failed acknowledgements, and replays on cold activation", async () => {
    const source = "workers/alarm-ownership";
    const className = "AlarmOwnershipVessel";
    const objectKey = "test-key";
    const executionDigest = "e".repeat(64);
    const publications: Array<{ revision: number; wakeAt: number | null }> = [];
    const methods: string[] = [];
    let publicationFailure: string | undefined;
    const rpcFetch: typeof fetch = async (_input, init) => {
      const envelope = JSON.parse(String(init?.body)) as RpcEnvelope;
      if (envelope.message.type !== "request")
        throw new Error("Expected host request");
      const { method, requestId, args } = envelope.message;
      methods.push(method);
      let result: unknown;
      let error: string | undefined;
      if (method === "workspace-state.alarmSourceRegister") {
        expect(args[0]).toEqual({
          source,
          className,
          objectKey,
          executionDigest,
        });
        result = {
          incarnation: "storage:alarm-ownership",
          entity: {
            id: `do:${source}:${className}:${objectKey}`,
            authoritySessionId: "authority:alarm-ownership",
            kind: "do",
            source: { repoPath: source, effectiveVersion: "test" },
            activeExecutionDigest: executionDigest,
            contextId: "context:alarm-ownership",
            className,
            key: objectKey,
            createdAt: 1,
            status: "active",
            cleanupComplete: false,
          },
        };
      } else if (method === "workspace-state.alarmSourcePublish") {
        if (publicationFailure) error = publicationFailure;
        else {
          publications.push(
            args[0] as { revision: number; wakeAt: number | null },
          );
          result = "accepted";
        }
      } else if (method === "authority.outstandingAcquisitions")
        result = { receipts: [], next: null };
      else if (
        ![
          "runtime.setTitle",
          "workspace-state.lifecycleLeaseUpsert",
          "workspace-state.lifecycleLeaseClear",
          "workerLog.write",
        ].includes(method)
      ) {
        error = `Unexpected host method ${method}`;
      }
      return new Response(
        JSON.stringify({
          from: envelope.target,
          target: envelope.from,
          delivery: { caller: { callerId: "main", callerKind: "server" } },
          provenance: [],
          message: {
            type: "response",
            requestId,
            ...(error
              ? { error: serializeRpcFailure(new Error(error)) }
              : { result }),
          },
        } satisfies RpcEnvelope),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const environment = {
      WORKER_SOURCE: source,
      WORKER_CLASS_NAME: className,
      WORKER_EXECUTION_DIGEST: executionDigest,
    };
    const hostFetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(rpcFetch);
    const fixture = await createNativeVesselTestDO(
      AlarmOwnershipVessel,
      environment,
    );
    let current = fixture;
    try {
      await expect(fixture.call("inspectPassiveState")).resolves.toBe("ready");
      expect(methods).not.toContain("workspace-state.entity.resolveActive");
      expect(methods).not.toContain("workspace-state.alarmSourceRegister");
      expect(publications).toEqual([]);

      const faux = fauxProvider();
      fixture.instance.models.setProvider(faux.provider);
      const session = await fixture.instance.open();
      const binding = {
        channelId: "channel:alarm-ownership",
        channelRef: { source: "workers/channel", className: "ChannelDO", objectKey: "channel:alarm-ownership" },
        contextId: "context:alarm-ownership",
      };
      const root = await openNativeChannelConversation(
        session,
        binding,
        { model: { provider: "faux", modelId: faux.getModel().id } },
        BACKGROUND_CONTEXT,
      );
      await root.submit(
        { type: "input", content: "retained runnable work" },
        BACKGROUND_CONTEXT,
      );
      // Submission commits its wake before the serialized host publication joins.
      // Complete that owned publication before measuring the next request's replay.
      await session.flushWake(BACKGROUND_CONTEXT);
      const committed = await session.snapshot(WakeDoc, BACKGROUND_CONTEXT);
      expect(committed).toMatchObject({ wakeAt: 0 });
      expect(committed!.publishedRevision).toBe(committed!.revision);
      // Join the submitted schedule before measuring an ordinary request replay.
      await session.flushWake(BACKGROUND_CONTEXT);
      expect(publications.at(-1)).toMatchObject({
        revision: committed!.revision,
        wakeAt: committed!.wakeAt,
      });
      const beforeRead = publications.length;
      await expect(fixture.call("inspectPassiveState")).resolves.toBe("ready");
      expect(publications).toHaveLength(beforeRead);
      expect(publications.at(-1)).toMatchObject({
        revision: committed!.revision,
        wakeAt: 0,
      });
      expect(methods).not.toContain("workspace-state.alarmSet");
      expect(methods).not.toContain("workspace-state.alarmClear");
      expect(faux.state.callCount).toBe(0);

      await releaseAcrossPhases(fixture.instance, {
        epoch: "cold-alarm-restart",
        mode: "suspend",
        reason: "restore retained pending cancellation",
        deadlineMs: 0,
      });
      current = await createNativeVesselTestDO(
        AlarmOwnershipVessel,
        environment,
        { db: fixture.db },
      );
      current.instance.models.setProvider(faux.provider);
      await current.instance.open();
      publicationFailure = "original host source publication failure";
      await expect(current.call("inspectPassiveState")).rejects.toThrow(
        publicationFailure,
      );
      publicationFailure = undefined;
      await expect(current.call("inspectPassiveState")).resolves.toBe("ready");
      expect(publications.at(-1)).toMatchObject({
        revision: committed!.revision,
        wakeAt: committed!.wakeAt,
      });
      const afterColdReplay = publications.length;
      await expect(current.call("inspectPassiveState")).resolves.toBe("ready");
      expect(publications).toHaveLength(afterColdReplay);
      const beforeCancel = methods.length;
      await expect(
        current.call("interruptChannel", binding.channelId),
      ).resolves.toEqual({ interrupted: true });
      expect(methods.slice(beforeCancel)).not.toContain(
        "workspace-state.alarmSourceRegister",
      );
      const reopened = await current.instance.open();
      expect(
        (
          await lookupNativeChannelConversation(
            reopened,
            binding,
            BACKGROUND_CONTEXT,
          )
        )?.id,
      ).toBe(root.id);
      const terminal = await reopened.snapshot(WakeDoc, BACKGROUND_CONTEXT);
      expect(terminal).toMatchObject({ wakeAt: null });
      await expect(current.call("inspectPassiveState")).resolves.toBe("ready");
      expect(publications.at(-1)).toMatchObject({
        revision: terminal!.revision,
        wakeAt: null,
      });
      expect(terminal!.revision).toBeGreaterThan(committed!.revision);
      expect(faux.state.callCount).toBe(0);
      expect(methods).not.toContain("workspace-state.alarmSet");
      expect(methods).not.toContain("workspace-state.alarmClear");
      const missing = { ...binding, channelId: "channel:missing", channelRef: { ...binding.channelRef, objectKey: "channel:missing" } };
      await expect(
        current.call("interruptChannel", missing.channelId),
      ).resolves.toEqual({ interrupted: true });
      expect(
        await lookupNativeChannelConversation(
          reopened,
          missing,
          BACKGROUND_CONTEXT,
        ),
      ).toBeNull();
    } finally {
      publicationFailure = undefined;
      try {
        await releaseAcrossPhases(current.instance, {
          epoch: "alarm-test-release",
          mode: "suspend",
          reason: "test complete",
          deadlineMs: 0,
        });
      } finally {
        fixture.db.close();
        hostFetch.mockRestore();
      }
    }
  });
});
