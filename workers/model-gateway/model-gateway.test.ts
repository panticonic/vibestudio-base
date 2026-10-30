import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTestDO,
  createTestDirectAuthority,
} from "@workspace/runtime/worker/test-utils";
import type { DirectAuthorityAttestation } from "@vibestudio/rpc/internal";
import { serializeRpcFailure, type RpcEnvelope } from "@vibestudio/rpc";
import { nativeInvocationId } from "@vibestudio/service-schemas/nativeInvocation";
import { channelTrajectoryFor } from "@vibestudio/trajectory-identity";
import type { DurableObjectSchemaDescriptor } from "@vibestudio/durable/schema";
import type {
  ModelRequestApi,
  ModelRequestConnection,
  ModelRequestTarget,
} from "@panticonic/pi-durable";
import type { Context } from "@panticonic/pi-chord";
import type { LifecyclePrepareInput } from "@workspace/runtime/worker/durable-base";
import {
  TEST_MODEL_REF,
  type ModelCatalogEntry,
} from "@workspace/model-catalog/catalog";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { ModelGatewayDO } from "./ModelGatewayDO.js";

const source = "workers/model-gateway";
const runtimeId = `do:${source}:ModelGatewayDO:test-key`;
const image = {
  WORKER_SOURCE: source,
  WORKER_CLASS_NAME: "ModelGatewayDO",
  WORKER_EXECUTION_DIGEST: "e".repeat(64),
  VIBESTUDIO_TEST_MODE: "1",
};
const releaseInput = {
  epoch: "release-one",
  mode: "suspend" as const,
  reason: "test",
  deadlineMs: 0,
};

type Settings = ReturnType<ModelGatewayDO["modelSettings"]>;

/** A catalog entry for the host-owned deterministic provider, optionally not yet usable. */
function testEntry(unusable: boolean): ModelCatalogEntry {
  return makeTestCatalogEntry({
    ref: TEST_MODEL_REF,
    id: "deterministic",
    name: "deterministic",
    provider: "vibestudio-test",
    baseUrl: "http://test.invalid/v1",
    auth: "none",
    availability: unusable
      ? { state: "needs-setup", detail: "no-credential" }
      : { state: "ready", detail: "deterministic-test" },
  });
}

/** Test seam: the model-settings resolution and the observation point of a request. */
class Gateway extends ModelGatewayDO {
  static executorReady = true;
  static roleResolutions = 0;
  static unusable = false;
  static observed: ((request: ModelRequestTarget) => Promise<void>) | undefined;

  protected override modelSettings(): Settings {
    const entry = testEntry(Gateway.unusable);
    return {
      call: async (method: string, ref: string) => {
        if (method === "resolveRole") {
          Gateway.roleResolutions++;
          return Gateway.executorReady
            ? { role: ref, ref: entry.ref, source: "hosted", model: entry, reason: "test" }
            : {
                role: ref,
                ref: null,
                source: "unavailable",
                model: null,
                reason: "No model fills the executor role",
              };
        }
        if (method === "getModel") return ref === TEST_MODEL_REF ? entry : null;
        throw new Error(`Unexpected settings call ${method}`);
      },
    } as unknown as Settings;
  }

  protected override async observeModelConnection(
    request: ModelRequestTarget,
    api: ModelRequestApi,
    connection: ModelRequestConnection,
    context: Context,
  ) {
    await Gateway.observed?.(request);
    const observed = await super.observeModelConnection(
      request,
      api,
      connection,
      context,
    );
    // The faux provider never builds an HTTP payload; a real one reports each
    // prepared payload through this hook, which is what records the evidence.
    await observed.options.onPayload?.({}, (api.prepared ?? request).model);
    return observed;
  }
}

const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
  Gateway.executorReady = true;
  Gateway.roleResolutions = 0;
  Gateway.unusable = false;
  Gateway.observed = undefined;
  for (const dispose of disposals.splice(0).reverse()) await dispose();
});

async function probe(): Promise<DurableObjectSchemaDescriptor> {
  const result = await createTestDO(
    Gateway,
    { ...image, VIBESTUDIO_SCHEMA_PROBE: true },
    { initialize: false },
  );
  try {
    const response = await result.instance.fetch(
      new Request("http://test/test-key/__vibestudio_schema_descriptor"),
    );
    return response.json();
  } finally {
    result.db.close();
  }
}

async function host() {
  const incarnation = "host-one";
  const active = {
    id: runtimeId,
    authoritySessionId: "authority:gateway-lifetime",
    kind: "do",
    source: { repoPath: source, effectiveVersion: "test" },
    activeExecutionDigest: image.WORKER_EXECUTION_DIGEST,
    contextId: "context:gateway",
    className: "ModelGatewayDO",
    key: "test-key",
    createdAt: 1,
    status: "active",
    cleanupComplete: false,
  };
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const envelope = JSON.parse(Buffer.concat(chunks).toString()) as RpcEnvelope;
    if (
      envelope.message.type !== "request" &&
      envelope.message.type !== "stream-request"
    )
      throw new Error("Unexpected host fixture envelope");
    const method = envelope.message.method;
    let result: unknown;
    let error: unknown;
    if (method === "workspace-state.entity.resolveActive") result = active;
    else if (method === "workspace-state.alarmSourcePublish") result = "accepted";
    else if (method === "authority.outstandingAcquisitions")
      result = { receipts: [], next: null };
    else if (
      ![
        "workspace-state.lifecycleLeaseUpsert",
        "workspace-state.lifecycleLeaseClear",
        "workerLog.write",
      ].includes(method)
    )
      error = `Unexpected host method ${method}`;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        from: envelope.target,
        target: envelope.from,
        delivery: { caller: { callerId: "main", callerKind: "server" } },
        provenance: [],
        message: {
          type: "response",
          requestId: envelope.message.requestId,
          ...(error !== undefined
            ? { error: serializeRpcFailure(error) }
            : { result }),
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Host fixture did not bind");
  disposals.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return {
    url: `http://127.0.0.1:${address.port}`,
    activation: {
      runtimeId,
      contextId: active.contextId,
      authoritySessionId: active.authoritySessionId,
      incarnation,
      generation: 1,
      executionDigest: active.activeExecutionDigest,
      effectiveVersion: active.source.effectiveVersion,
    },
  };
}

async function gateway(env: Record<string, unknown> = {}) {
  const fixtureHost = await host();
  const fixture = await createTestDO(
    Gateway,
    {
      ...image,
      VIBESTUDIO_SCHEMA_DESCRIPTOR: await probe(),
      GATEWAY_URL: fixtureHost.url,
      ...env,
    },
    { props: { stateArgs: null, image: null, nativeOwner: fixtureHost.activation } },
  );
  disposals.push(async () => {
    let result = await fixture.instance.releaseForLifecycle({
      ...releaseInput,
      phase: "quiesce",
    } satisfies LifecyclePrepareInput);
    for (const phase of ["peer-obligations", "release"] as const)
      if (result.status !== "failed")
        result = await fixture.instance.releaseForLifecycle({
          ...releaseInput,
          phase,
        });
    fixture.db.close();
  });
  return { ...fixture, activation: fixtureHost.activation };
}

const evalCaller = {
  callerId: "do:vibestudio/internal:EvalDO:abc",
  callerKind: "agent" as const,
  userId: "user:test",
};

const userMessage = (text: string) => ({
  role: "user" as const,
  content: text,
  timestamp: 10,
});

function websiteCaller(method: string) {
  const subject = "website:site-1" as const;
  const userId = "user:test" as const;
  const binding = { subject, generation: 0, documentId: "document-1" };
  const baseAuthorization = createTestDirectAuthority({
    callerKind: "panel",
    method,
  });
  const authorization: DirectAuthorityAttestation = {
    ...baseAuthorization,
    context: {
      ...baseAuthorization.context,
      authorizingOrigin: { kind: "website", principal: subject } as const,
      executingCode: null,
      subjectBinding: binding,
      website: {
        subject,
        userId,
        workspaceId: "test",
        origin: "https://example.com",
        binding,
        connected: true,
      },
      initiatorChain: [userId, subject],
      ownerChain: [userId],
    },
  };
  return { callerId: "website" as const, callerKind: "panel" as const, authorization };
}

describe("ModelGatewayDO", () => {
  it("runs one turn as a native task and returns the Pi message, resolved ref and usage", async () => {
    const { callAs } = await gateway();
    const result = await callAs(evalCaller, "turn", {
      turnId: "t1",
      model: TEST_MODEL_REF,
      context: {
        systemPrompt: "Answer briefly.",
        messages: [userMessage("hello")],
      },
      options: { temperature: 0, maxTokens: 64 },
    });
    expect(result).toMatchObject({
      status: "completed",
      turnId: "t1",
      model: TEST_MODEL_REF,
      message: { role: "assistant", stopReason: "stop" },
    });
    expect(result).toMatchObject({
      attribution: { callerId: evalCaller.callerId, agentId: "test", userId: "user:test" },
    });
    expect((result as { usage: unknown }).usage).toEqual(
      (result as { message: { usage: unknown } }).message.usage,
    );
  });

  it("returns tool calls for a tool-carrying turn", async () => {
    const { callAs } = await gateway({
      VIBESTUDIO_TEST_MODEL_SCRIPT: JSON.stringify({
        rules: [
          {
            match: "weather",
            steps: [{ tool: "get_weather", arguments: { city: "Oslo" } }],
            reply: "done",
          },
        ],
      }),
    });
    const result = (await callAs(evalCaller, "turn", {
      turnId: "t-tools",
      model: TEST_MODEL_REF,
      context: {
        systemPrompt: "Use tools.",
        messages: [userMessage("what is the weather")],
        tools: [
          {
            name: "get_weather",
            description: "Weather for a city",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        ],
      },
      options: { toolChoice: "auto" },
    })) as { message: { stopReason: string; content: Array<{ type: string; name?: string }> } };
    expect(result.message.stopReason).toBe("toolUse");
    expect(result.message.content).toContainEqual(
      expect.objectContaining({ type: "toolCall", name: "get_weather" }),
    );
  });

  it("resolves the executor role per turn from current readiness and returns the resolved ref", async () => {
    const { callAs } = await gateway();
    const first = await callAs(evalCaller, "turn", {
      turnId: "r1",
      model: "executor",
      context: { messages: [userMessage("one")] },
    });
    expect(first).toMatchObject({
      status: "completed",
      role: "executor",
      model: TEST_MODEL_REF,
    });
    // Readiness changed between turns: the next turn resolves again, and fails
    // with the role's own reason rather than falling back to anything.
    Gateway.executorReady = false;
    await expect(
      callAs(evalCaller, "turn", {
        turnId: "r2",
        model: "executor",
        context: { messages: [userMessage("two")] },
      }),
    ).rejects.toThrow(/No model fills the executor role/u);
    expect(Gateway.roleResolutions).toBe(2);
  });

  it("rejects models that are unknown or not usable instead of waiting for a connection", async () => {
    const { callAs } = await gateway();
    await expect(
      callAs(evalCaller, "turn", {
        turnId: "u1",
        model: "nope:missing",
        context: { messages: [userMessage("x")] },
      }),
    ).rejects.toThrow(/Unknown model/u);
    Gateway.unusable = true;
    await expect(
      callAs(evalCaller, "turn", {
        turnId: "u2",
        model: TEST_MODEL_REF,
        context: { messages: [userMessage("x")] },
      }),
    ).rejects.toThrow(/not available/u);
  });

  it("denies a website principal", async () => {
    const { callAs } = await gateway();
    await expect(
      callAs(websiteCaller("turn"), "turn", {
        turnId: "w1",
        model: TEST_MODEL_REF,
        context: { messages: [userMessage("x")] },
      }),
    ).rejects.toThrow(/receiver is closed to websites/u);
  });

  it("records the caller, owning agent and user with the native model evidence", async () => {
    const { callAs, call } = await gateway();
    await callAs(evalCaller, "turn", {
      turnId: "a1",
      model: "executor",
      context: { messages: [userMessage("attribute me")] },
    });
    const evidence = (await call("inspectTurns")) as {
      calls: Array<{
        attribution?: Record<string, unknown>;
        outcome?: string;
        usage?: unknown;
      }>;
    };
    expect(evidence.calls).toHaveLength(1);
    expect(evidence.calls[0]).toMatchObject({
      outcome: "completed",
      attribution: {
        turnId: "a1",
        requested: "executor",
        model: TEST_MODEL_REF,
        callerId: evalCaller.callerId,
        callerKind: "agent",
        agentId: "test",
        userId: "user:test",
      },
    });
    expect(evidence.calls[0]?.usage).toBeDefined();
  });

  it("attributes a native invocation to the gateway's own trajectory, with no channel", async () => {
    const gate = await gateway();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    let observed!: ModelRequestTarget;
    const requested = new Promise<void>((resolve) => {
      Gateway.observed = async (request) => {
        observed = request;
        resolve();
        await hold;
      };
    });
    const pending = gate.callAs(evalCaller, "turn", {
      turnId: "i1",
      model: TEST_MODEL_REF,
      context: { messages: [userMessage("inspect me")] },
    });
    await requested;
    const identity = {
      owner: {
        runtimeId,
        authoritySessionId: gate.activation.authoritySessionId,
      },
      task: { conversationId: observed.conversationId, taskId: observed.taskId },
      operation: {
        kind: "model" as const,
        purpose: observed.purpose as "generation",
        attempt: observed.attempt,
        cutoff: observed.cutoff,
        providerId: observed.model.provider,
        modelId: observed.model.id,
        endpoint: observed.model.baseUrl ?? null,
      },
    };
    const inspection = (await gate.call("inspectNativeInvocationSource", {
      taskId: observed.taskId,
      invocationId: nativeInvocationId(identity),
    })) as {
      source: { owner: { channelId: string; runtimeId: string } };
      status: string;
      originatingInput: unknown;
    };
    expect(inspection.source.owner.channelId).toBe(runtimeId);
    expect(channelTrajectoryFor(inspection.source.owner.channelId).logId).toBe(runtimeId);
    expect(inspection.status).toBe("running");
    expect(inspection.originatingInput).toBeNull();
    release();
    await expect(pending).resolves.toMatchObject({ status: "completed" });
  });

  it("settles a pending turn as cancelled when its caller cancels it, and only its caller can", async () => {
    const gate = await gateway();
    let release!: () => void;
    const hold = new Promise<void>((resolve, reject) => {
      release = resolve;
      void reject;
    });
    const requested = new Promise<void>((resolve) => {
      Gateway.observed = async (_request) => {
        resolve();
        await hold;
      };
    });
    const pending = gate.callAs(evalCaller, "turn", {
      turnId: "c1",
      model: TEST_MODEL_REF,
      context: { messages: [userMessage("cancel me")] },
    });
    await requested;
    // Another principal's cancel finds no such turn: ids are scoped to the caller.
    await expect(
      gate.callAs({ ...evalCaller, callerId: "do:other" }, "cancel", { turnId: "c1" }),
    ).resolves.toEqual({ cancelled: false });
    const cancelled = gate.callAs(evalCaller, "cancel", { turnId: "c1" });
    // The observation point is blocked in the model request; abort reaches it
    // through the task's signal, so release it to let the join complete.
    release();
    await expect(cancelled).resolves.toEqual({ cancelled: true });
    await expect(pending).resolves.toEqual({ status: "cancelled", turnId: "c1" });
    await expect(
      gate.callAs(evalCaller, "cancel", { turnId: "c1" }),
    ).resolves.toEqual({ cancelled: false });
  });

  it("rejects a second pending turn with the same id from one caller", async () => {
    const gate = await gateway();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const requested = new Promise<void>((resolve) => {
      Gateway.observed = async () => {
        resolve();
        await hold;
      };
    });
    const first = gate.callAs(evalCaller, "turn", {
      turnId: "d1",
      model: TEST_MODEL_REF,
      context: { messages: [userMessage("first")] },
    });
    await requested;
    await expect(
      gate.callAs(evalCaller, "turn", {
        turnId: "d1",
        model: TEST_MODEL_REF,
        context: { messages: [userMessage("second")] },
      }),
    ).rejects.toThrow(/already pending/u);
    release();
    await expect(first).resolves.toMatchObject({ status: "completed" });
  });
});
