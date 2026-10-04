import { retainNativeToolInvocation } from "./native-invocation-source.js";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  Type,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { JsonValue } from "@panticonic/pi-chord";
import {
  acceptReceipt,
  bindReceipt,
  createRegistry,
  defineExtension,
  defineTool,
  ReceiptDoc,
  type Harness,
  type ModelRequestApi,
  type ModelRequestPort,
  type ModelRequestTarget,
} from "@panticonic/pi-durable";
import type { NativeStorage } from "@panticonic/pi-durable/storage/sqlite";
import type { DurableObjectSchemaDescriptor } from "@vibestudio/durable/schema";
import {
  createTestDO,
  createTestDirectAuthority,
} from "@workspace/runtime/worker/test-utils";
import {
  rpc,
  RpcBoundaryError,
  type AcquisitionInfo,
  type RpcCallOptions,
  type RpcEnvelope,
} from "@vibestudio/rpc";
import { bindExecutionSession } from "@vibestudio/rpc/internal";
import {
  encodeHeadFrame,
  encodeDataFrame,
  encodeEndFrame,
} from "@vibestudio/rpc/protocol/streamCodec";
import {
  NativeAgentOwner,
  type NativeAgentOptions,
} from "./native-agent-owner.js";
import type { LifecyclePrepareInput } from "@workspace/runtime/worker/durable-base";
import { evalRuntimeId } from "@vibestudio/shared/evalRuntimeIdentity";
import { bindEvalRun, recordEvalAdmission } from "./native-eval-receipts.js";
import {
  authorityAcquisitionReceiptSchema,
  type AuthorityAcquisitionReceipt,
} from "@vibestudio/service-schemas/authority";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import type { AuthorityInvocation } from "./native-authority-receipts.js";
import { nativeInvocationId } from "@vibestudio/service-schemas/nativeInvocation";
import { channelTrajectoryFor } from "@vibestudio/trajectory-identity";

class Owner extends NativeAgentOwner {
  readonly models = createModels();
  modelRequests: ModelRequestPort = async () => ({
    status: "ready",
    options: {},
    close: async () => {},
  });
  productRelease: (
    input: LifecyclePrepareInput,
    harness: Harness,
  ) => Promise<void> = async () => {};
  foregroundCanReturn: Promise<unknown> = Promise.resolve();
  ownerCallOptions: RpcCallOptions = {};
  lastOwnerError: unknown;
  settings: NativeAgentOptions["settings"];
  @rpc({
    website: { kind: "closed", reason: "Test owner RPC scope." },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async inspectOwnerAdmission() {
    try {
      return await this.agentRpc.call(
        "main",
        "credentials.resolveCredential",
        [{ url: "https://provider.test/v1" }],
        this.ownerCallOptions,
      );
    } catch (error) {
      this.lastOwnerError = error;
      throw error;
    }
  }
  @rpc({
    website: { kind: "closed", reason: "Test owner stream scope." },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async inspectOwnerStream() {
    const response = await this.agentRpc.stream(
      "main",
      "credentials.proxyFetch",
      [{ url: "https://provider.test/v1" }],
      this.ownerCallOptions,
    );
    return {
      status: response.status,
      url: response.url,
      body: await response.text(),
    };
  }
  @rpc({
    website: { kind: "closed", reason: "Test input admission." },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async submitForScope() {
    const harness = await this.agentSession();
    const root = await harness.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: "faux", modelId: "faux-1" } },
    });
    await root.submit({ type: "input", content: "go" }, BACKGROUND_CONTEXT);
    await this.foregroundCanReturn;
    return { conversationId: root.id, authority: this.authorization };
  }
  @rpc({
    website: { kind: "closed", reason: "Test native execution RPC ownership." },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async inspectNativeExecutionAdmission() {
    return this.agentExecutionRpc
      .peer<{
        resolveCredential: (input: { url: string }) => unknown;
      }>("main", this.ownerCallOptions)
      .call.resolveCredential({ url: "https://provider.test/v1" });
  }
  probeCallerAdmission(url: string) {
    return this.rpc.call("main", "credentials.resolveCredential", [{ url }], {
      authorityAcquisition: "return",
    });
  }
  authorityProbe() {
    return this.authorization;
  }
  protected agentOptions(): NativeAgentOptions {
    return {
      registry: createRegistry(),
      models: this.models,
      modelRequests: this.modelRequests,
      settings: this.settings,
    };
  }
  protected override createAgentTables() {
    this.sql
      .exec(
        "CREATE TABLE product_value (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
      )
      .toArray();
    if (this.env["FAIL_PRODUCT_SCHEMA"])
      throw new Error("product schema failure");
  }
  protected releaseAgentResources(
    input: LifecyclePrepareInput,
    harness: Harness,
  ): Promise<void> {
    return this.productRelease(input, harness);
  }
  hostCall<T>(method: string, args: unknown[]) {
    return this.callAgentHost<T>(method, args);
  }
  open() {
    return this.agentSession();
  }
  authorityWait(
    request: ModelRequestTarget,
    api: ModelRequestApi,
    info: AcquisitionInfo,
    invocation: AuthorityInvocation,
    context: Parameters<ModelRequestPort>[2],
  ) {
    return this.waitForAgentAuthority(request, api, info, invocation, context);
  }
  resources() {
    return this.retainedModelConnections();
  }
  failConfirmation() {
    const native = this.ctx.storage as typeof this.ctx.storage & NativeStorage;
    native.sync = () => Promise.reject(new Error("confirmation failure"));
  }
}

const source = "workers/native-owner";
const runtimeId = `do:${source}:Owner:test-key`;
const image = {
  WORKER_SOURCE: source,
  WORKER_CLASS_NAME: "Owner",
  WORKER_EXECUTION_DIGEST: "e".repeat(64),
};
const releaseInput = {
  epoch: "release-one",
  mode: "suspend" as const,
  reason: "test",
  deadlineMs: 0,
};
const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposals.splice(0).reverse()) await dispose();
});

async function probe(): Promise<DurableObjectSchemaDescriptor> {
  const result = await createTestDO(
    Owner,
    { ...image, VIBESTUDIO_SCHEMA_PROBE: true },
    { initialize: false },
  );
  try {
    const response = await result.instance.fetch(
      new Request("http://test/test-key/__vibestudio_schema_descriptor"),
    );
    expect(response.status).toBe(200);
    return response.json();
  } finally {
    result.db.close();
  }
}

async function host() {
  const calls: string[] = [];
  const envelopes: RpcEnvelope[] = [];
  const handlers = new Map<string, (args: unknown[]) => Promise<unknown>>();
  let active: unknown = {
    id: runtimeId,
    authoritySessionId: "authority:owner-lifetime",
    kind: "do",
    source: { repoPath: source, effectiveVersion: "test" },
    activeExecutionDigest: image.WORKER_EXECUTION_DIGEST,
    contextId: "context:owner",
    className: "Owner",
    key: "test-key",
    createdAt: 1,
    status: "active",
    cleanupComplete: false,
  };
  let incarnation = "host-one";
  let hold: Promise<void> | undefined;
  let onResolve = () => {};
  let clearFailures = 0;
  let acknowledgementFailures = 0;
  let receipt: unknown = null;
  let onAcknowledgement = async () => {};
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const envelope = JSON.parse(
      Buffer.concat(chunks).toString(),
    ) as RpcEnvelope;
    if (
      envelope.message.type !== "request" &&
      envelope.message.type !== "stream-request"
    )
      throw new Error("Unexpected host fixture envelope");
    envelopes.push(envelope);
    const method = envelope.message.method;
    calls.push(method);
    let result: unknown;
    let error: string | undefined;
    let boundaryError: RpcBoundaryError | undefined;
    const handler = handlers.get(method);
    if (handler) {
      try {
        result = await handler(envelope.message.args);
      } catch (failure) {
        error = failure instanceof Error ? failure.message : String(failure);
        if (failure instanceof RpcBoundaryError) boundaryError = failure;
      }
    } else if (method === "workspace-state.entity.resolveActive") {
      onResolve();
      await hold;
      result = active;
    } else if (method === "workspace-state.alarmSourceRegister")
      result = incarnation;
    else if (method === "workspace-state.alarmSourcePublish")
      result = "accepted";
    else if (method === "authority.outstandingAcquisitions")
      result = { receipts: [], next: null };
    else if (method === "eval.receipt") result = receipt;
    else if (method === "eval.acknowledge") {
      await onAcknowledgement();
      if (acknowledgementFailures-- > 0)
        error = "acknowledgement response lost";
      else result = { acknowledged: true, duplicate: false };
    } else if (
      method === "workspace-state.lifecycleLeaseClear" &&
      clearFailures-- > 0
    )
      error = "lease clear unavailable";
    else if (
      ![
        "workspace-state.lifecycleLeaseUpsert",
        "workspace-state.lifecycleLeaseClear",
        "workerLog.write",
      ].includes(method)
    )
      error = `Unexpected host method ${method}`;
    if (result instanceof Response) {
      response.writeHead(result.status, Object.fromEntries(result.headers));
      // This fixture response is a finite, caller-created protocol packet.
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
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
          ...(error
            ? {
                error,
                ...(boundaryError
                  ? {
                      errorKind: boundaryError.errorKind,
                      errorCode: boundaryError.code,
                      errorData: boundaryError.errorData,
                    }
                  : {}),
              }
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
    calls,
    envelopes,
    handle: (
      method: string,
      handler: (args: unknown[]) => Promise<unknown>,
    ) => {
      handlers.set(method, handler);
    },
    url: `http://127.0.0.1:${address.port}`,
    setActive: (value: unknown) => {
      active = value;
    },
    setAgentBinding: (channelId: string) => {
      active = {
        ...(active as object),
        agentBinding: {
          entityId: runtimeId,
          contextId: "context:owner",
          channelId,
        },
      };
    },
    setAuthoritySession: (value: string) => {
      active = { ...(active as object), authoritySessionId: value };
    },
    setIncarnation: (value: string) => {
      incarnation = value;
    },
    holdResolution: (promise: Promise<void>, observed: () => void) => {
      hold = promise;
      onResolve = observed;
    },
    failClear: () => {
      clearFailures = 1;
    },
    setReceipt: (value: unknown) => {
      receipt = value;
    },
    onAck: (observe: () => Promise<void>) => {
      onAcknowledgement = observe;
    },
    loseAck: () => {
      acknowledgementFailures = 1;
    },
  };
}

async function owner(
  hostFixture: Awaited<ReturnType<typeof host>>,
  extra: Record<string, unknown> = {},
  db?: Awaited<ReturnType<typeof createTestDO>>["db"],
) {
  const fixture = await createTestDO(
    Owner,
    {
      ...image,
      VIBESTUDIO_SCHEMA_DESCRIPTOR: await probe(),
      GATEWAY_URL: hostFixture.url,
      ...extra,
    },
    { db },
  );
  disposals.push(async () => {
    await fixture.instance.releaseForLifecycle(releaseInput);
    if (!db) fixture.db.close();
  });
  return fixture;
}

const authorityInvocation: AuthorityInvocation = {
  service: "credentials",
  method: "resolveCredential",
  args: [{ url: "https://provider.test/v1" }],
};

function pendingAuthorityReceipt(
  sessionId = "authority:owner-lifetime",
): AuthorityAcquisitionReceipt {
  return {
    acquisitionId: "acq:native-model",
    bindingDigest: "b".repeat(64),
    createdAt: 1,
    state: "pending",
    admission: {
      requestKey: "native-owner/model",
      ownerRuntimeId: runtimeId,
      sessionId,
      facts: { opaqueHostAdmission: ["original", "immutable"] },
    },
    invocations: [
      {
        causalParent: null,
        nativeInvocation: null,
        ownerRuntimeId: runtimeId,
        sessionId,
        code: {
          repoPath: source,
          effectiveVersion: "test",
          executionDigest: image.WORKER_EXECUTION_DIGEST,
        },
        service: authorityInvocation.service,
        method: authorityInvocation.method,
        argsDigest: sha256HexSyncText(canonicalJson(authorityInvocation.args)),
        preparedStateDigest: "-",
        snapshotDigest: "c".repeat(64),
        capability: "credentials.resolve",
        resourceKey: "https://provider.test/v1",
      },
    ],
  };
}

function authorityHost(
  h: Awaited<ReturnType<typeof host>>,
  sessionId = "authority:owner-lifetime",
) {
  h.setAuthoritySession(sessionId);
  const pending = pendingAuthorityReceipt(sessionId);
  let receipt: AuthorityAcquisitionReceipt | null = pending;
  const original = pending.invocations[0]!;
  const info: AcquisitionInfo = {
    acquisitionId: pending.acquisitionId,
    ownerRuntimeId: runtimeId,
    snapshotDigest: original.snapshotDigest,
    capability: original.capability,
    resourceKey: original.resourceKey,
    tier: "gated",
    cardType: "permission.gated",
    renderedAction: "use the model account",
    pending: true,
  };
  let loseAcknowledgement = false;
  let acknowledged = false;
  let onAcknowledgement = async () => {};
  const acknowledgements: unknown[][] = [];
  const withdrawals: unknown[][] = [];
  let withdrawalFailure: unknown;
  h.handle("authority.withdrawAcquisition", async (args) => {
    withdrawals.push(args);
    expect(args).toEqual([
      {
        acquisitionId: pending.acquisitionId,
        bindingDigest: pending.bindingDigest,
      },
    ]);
    if (withdrawalFailure) throw withdrawalFailure;
    if (!receipt) throw new Error("Unknown canonical acquisition");
    if (receipt.state === "pending")
      receipt = {
        ...receipt,
        state: "closed",
        resolution: { state: "closed", reason: "operation-ended" },
        resolutionDigest: "e".repeat(64),
        settledAt: 3,
      };
    return receipt;
  });
  h.handle("authority.acquisitionReceipt", async (args) => {
    expect(args).toEqual([{ acquisitionId: pending.acquisitionId }]);
    return receipt;
  });
  h.handle("authority.outstandingAcquisitions", async () => ({
    receipts: receipt && !acknowledged ? [receipt] : [],
    next: null,
  }));
  h.handle("authority.acknowledgeAcquisition", async (args) => {
    acknowledgements.push(args);
    await onAcknowledgement();
    if (loseAcknowledgement) {
      loseAcknowledgement = false;
      throw new Error("Authority acknowledgement response lost");
    }
    acknowledged = true;
    return { acknowledged: true };
  });
  return {
    info,
    pending,
    acknowledgements,
    withdrawals,
    failWithdrawal: (error: unknown) => {
      withdrawalFailure = error;
    },
    replace: (value: AuthorityAcquisitionReceipt | null) => {
      receipt = value;
    },
    current: () => receipt,
    settle: (
      state: "decided" | "closed" | "failed" = "decided",
    ): Exclude<AuthorityAcquisitionReceipt, { state: "pending" }> => {
      const resolution: JsonValue =
        state === "decided"
          ? { state, decision: "once" }
          : state === "closed"
            ? { reason: "owner-retired" }
            : {
                state,
                error: { message: "Original failure", code: "ECONNECTION" },
              };
      const terminal: Exclude<
        AuthorityAcquisitionReceipt,
        { state: "pending" }
      > = {
        ...pending,
        state,
        resolution,
        resolutionDigest: "d".repeat(64),
        settledAt: 2,
      };
      receipt = terminal;
      return terminal;
    },
    loseAck: () => {
      loseAcknowledgement = true;
    },
    onAck: (observe: () => Promise<void>) => {
      onAcknowledgement = observe;
    },
  };
}

async function authorityOwner(
  h: Awaited<ReturnType<typeof host>>,
  authority: ReturnType<typeof authorityHost>,
  db?: Awaited<ReturnType<typeof createTestDO>>["db"],
  changeApi?: (api: ModelRequestApi) => ModelRequestApi,
) {
  const fixture = await owner(h, {}, db);
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("done")]);
  fixture.instance.models.setProvider(faux.provider);
  let session: Harness;
  const requests: ModelRequestTarget[] = [];
  const errors: unknown[] = [];
  fixture.instance.modelRequests = async (request, api, context) => {
    requests.push(request);
    const consumed = await session.snapshot(
      ReceiptDoc,
      authority.info.acquisitionId,
      context,
    );
    if (consumed?.result !== undefined)
      return { status: "ready", options: {}, close: async () => {} };
    try {
      return await fixture.instance.authorityWait(
        request,
        changeApi ? changeApi(api) : api,
        authority.info,
        authorityInvocation,
        context,
      );
    } catch (error) {
      errors.push(error);
      throw error;
    }
  };
  session = await fixture.instance.open();
  const root = await session.root(BACKGROUND_CONTEXT, {
    agent: { model: { provider: "faux", modelId: "faux-1" } },
  });
  return {
    fixture,
    session,
    root,
    faux,
    requests,
    errors,
    start: async () => {
      const submission = await root.submit(
        { type: "input", content: "go" },
        BACKGROUND_CONTEXT,
      );
      await session.runPass(BACKGROUND_CONTEXT);
      return submission;
    },
  };
}

async function ordinaryAuthorityOwner(waiting: boolean) {
  const h = await host();
  const authority = authorityHost(h);
  h.setActive({
    id: runtimeId,
    authoritySessionId: "authority:owner-lifetime",
    kind: "do",
    source: { repoPath: source, effectiveVersion: "test" },
    activeExecutionDigest: image.WORKER_EXECUTION_DIGEST,
    contextId: "context:owner",
    className: "Owner",
    key: "test-key",
    createdAt: 1,
    status: "active",
    cleanupComplete: false,
    agentBinding: {
      entityId: runtimeId,
      contextId: "context:owner",
      channelId: "channel:owner",
    },
  });
  const fixture = await owner(h);
  const faux = fauxProvider();
  fixture.instance.models.setProvider(faux.provider);
  const registry = createRegistry();
  let session!: Harness;
  const tool = defineTool({
    name: "ordinary",
    description: "original native operation",
    parameters: Type.Object({}),
    execute: async (_args, api, context) => {
      const task = await api.getTask(api.taskId, context);
      if (
        !task ||
        !task.input ||
        typeof task.input !== "object" ||
        Array.isArray(task.input)
      )
        throw new Error("No actual original tool input");
      const originalSource = task.input["source"];
      if (
        !originalSource ||
        typeof originalSource !== "object" ||
        Array.isArray(originalSource) ||
        originalSource["kind"] !== "assistant" ||
        typeof originalSource["entryId"] !== "number"
      )
        throw new Error(
          "No original assistant source for ordinary tool fixture",
        );
      const nativeInvocation = {
        owner: { runtimeId, authoritySessionId: "authority:owner-lifetime" },
        task: { taskId: api.taskId, conversationId: api.conversationId },
        operation: {
          kind: "tool" as const,
          assistantEntryId: originalSource["entryId"],
          callId: api.callId,
        },
      };
      const id = nativeInvocationId(nativeInvocation);
      const trajectory = channelTrajectoryFor("channel:owner");
      authority.replace(
        authorityAcquisitionReceiptSchema.parse({
          ...authority.pending,
          invocations: authority.pending.invocations.map((invocation) => ({
            ...invocation,
            nativeInvocation,
            causalParent: {
              kind: "trajectory-invocation",
              logId: trajectory.logId,
              head: trajectory.head,
              invocationId: id,
            },
          })),
        }),
      );
      if (!waiting) return { content: [] };
      await api.commit(
        (tx) => bindReceipt(tx, "ordinary:external", "original"),
        context,
      );
      return {
        wait: {
          kind: "receipt" as const,
          key: "ordinary:external",
          binding: "original",
        },
        continuation: { external: "original" },
      };
    },
    cancel: async () => ({ content: [] }),
  });
  registry.install(defineExtension({ name: "ordinary", tools: [tool] }));
  Object.defineProperty(fixture.instance, "agentOptions", {
    value: () => ({
      registry,
      models: fixture.instance.models,
      modelRequests: fixture.instance.modelRequests,
    }),
  });
  session = await fixture.instance.open();
  const root = await session.root(BACKGROUND_CONTEXT, {
    agent: {
      model: { provider: "faux", modelId: faux.getModel().id },
      tools: [tool],
    },
  });
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("ordinary", {}, { id: "ordinary-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("done"),
  ]);
  const submission = await root.submit(
    { type: "input", content: "go" },
    BACKGROUND_CONTEXT,
  );
  await session.runPass(BACKGROUND_CONTEXT);
  return { h, authority, fixture, session, root, submission };
}

describe("native Pi entity activation and release", () => {
  it("keeps ordinary approval live until its actual native task ends and then closes exact authority", async () => {
    const f = await ordinaryAuthorityOwner(true);
    await f.fixture.instance.alarm();
    expect(f.authority.withdrawals).toEqual([]);
    expect(
      await f.session.snapshot(
        ReceiptDoc,
        f.authority.pending.acquisitionId,
        BACKGROUND_CONTEXT,
      ),
    ).toBeUndefined();
    await f.root.abort(BACKGROUND_CONTEXT);
    await f.fixture.instance.alarm();
    expect(f.authority.withdrawals).toHaveLength(1);
    expect(f.authority.acknowledgements).toHaveLength(1);
    expect(
      (
        await f.session.snapshot(
          ReceiptDoc,
          f.authority.pending.acquisitionId,
          BACKGROUND_CONTEXT,
        )
      )?.result,
    ).toEqual({ state: "closed", reason: "operation-ended" });
    await f.fixture.instance.alarm();
    expect(f.authority.withdrawals).toHaveLength(1);
  });

  it("retains ordinary exact closure failure for original terminal task recovery", async () => {
    const f = await ordinaryAuthorityOwner(false);
    await f.submission.wait(BACKGROUND_CONTEXT);
    const original = new Error("original ordinary acquisition closure failure");
    f.authority.failWithdrawal(original);
    await expect(f.fixture.instance.alarm()).rejects.toThrow(original.message);
    expect(f.authority.acknowledgements).toEqual([]);
    expect(
      (
        await f.session.snapshot(
          ReceiptDoc,
          f.authority.pending.acquisitionId,
          BACKGROUND_CONTEXT,
        )
      )?.result,
    ).toBeUndefined();
    f.authority.failWithdrawal(undefined);
    await f.fixture.instance.alarm();
    expect(f.authority.withdrawals).toHaveLength(2);
    expect(f.authority.acknowledgements).toHaveLength(1);
  });

  it("does not bind or withdraw foreign ordinary source receipts and refuses conflicting original images", async () => {
    const f = await ordinaryAuthorityOwner(false);
    await f.submission.wait(BACKGROUND_CONTEXT);
    const original = f.authority.current()!;
    f.authority.replace(
      authorityAcquisitionReceiptSchema.parse({
        ...original,
        invocations: original.invocations.map((invocation) => ({
          ...invocation,
          causalParent: {
            ...invocation.causalParent!,
            invocationId: "invocation:native:foreign",
          },
        })),
      }),
    );
    await expect(f.fixture.instance.alarm()).rejects.toThrow(
      "conflicts with its original native source",
    );
    expect(f.authority.withdrawals).toEqual([]);
    expect(
      await f.session.snapshot(
        ReceiptDoc,
        original.acquisitionId,
        BACKGROUND_CONTEXT,
      ),
    ).toBeUndefined();
    f.authority.replace(
      authorityAcquisitionReceiptSchema.parse({
        ...original,
        invocations: original.invocations.map((invocation) => ({
          ...invocation,
          code: { ...invocation.code!, executionDigest: "f".repeat(64) },
        })),
      }),
    );
    await expect(f.fixture.instance.alarm()).rejects.toThrow(
      "conflicts with its original native source",
    );
    expect(f.authority.withdrawals).toEqual([]);
    expect(f.authority.acknowledgements).toEqual([]);
    expect(
      await f.session.snapshot(
        ReceiptDoc,
        original.acquisitionId,
        BACKGROUND_CONTEXT,
      ),
    ).toBeUndefined();
  });
  it("keeps actual deferred provider cancellation authorized after lifecycle admission seals", async () => {
    const h = await host();
    const fixture = await owner(h);
    const faux = fauxProvider({ deferred: { pollAfterMs: 60_000 } });
    faux.setResponses([fauxAssistantMessage("deferred")]);
    fixture.instance.models.setProvider(faux.provider);
    fixture.instance.settings = { stream: { deferred: true } };
    const operations: string[] = [];
    fixture.instance.modelRequests = async (request) => {
      operations.push(request.operation);
      return { status: "ready", options: {}, close: async () => {} };
    };
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: "faux", modelId: "faux-1" } },
    });
    await root.submit({ type: "input", content: "go" }, BACKGROUND_CONTEXT);
    await session.runPass(BACKGROUND_CONTEXT);
    fixture.instance.productRelease = async () => {
      await root.abort(BACKGROUND_CONTEXT);
    };
    await expect(
      fixture.instance.releaseForLifecycle({
        ...releaseInput,
        mode: "retire",
        reason: "entity_retire",
      }),
    ).resolves.toEqual({ status: "ready" });
    expect(operations).toEqual(["stream", "cancelDeferred"]);
    expect(faux.state.cancelledDeferred).toHaveLength(1);
    expect(fixture.instance.resources()).toEqual([]);
  });

  it("returns protected owner admission for a durable wait instead of awaiting a human decision", async () => {
    const h = await host();
    const fixture = await owner(h);
    const acquisition = {
      acquisitionId: "acq:owner",
      ownerRuntimeId: runtimeId,
    };
    h.handle("credentials.resolveCredential", async () => {
      throw new RpcBoundaryError(
        "Approval required",
        "access",
        "EACQUIRE",
        undefined,
        { acquisition },
      );
    });
    fixture.instance.ownerCallOptions = { authorityAcquisition: "wait" };
    await expect(fixture.call("inspectOwnerAdmission")).rejects.toThrow(
      "Approval required",
    );
    expect(fixture.instance.lastOwnerError).toMatchObject({
      code: "EACQUIRE",
      errorKind: "access",
      errorData: { acquisition },
    });
    expect(h.calls).not.toContain("authority.awaitDecision");
    const envelope = h.envelopes.find(
      (e) =>
        e.message.type === "request" &&
        e.message.method === "credentials.resolveCredential",
    );
    expect(envelope?.from).toBe(runtimeId);
    expect(envelope?.message).not.toHaveProperty("authorityParentNonce");
  });

  it("preserves separately admitted execution and exact provenance on owner RPC", async () => {
    const h = await host();
    const fixture = await owner(h);
    h.handle("credentials.resolveCredential", async () => null);
    const causalParent = {
      kind: "trajectory-invocation" as const,
      logId: "owner",
      head: "main",
      invocationId: "invocation:exact",
    };
    fixture.instance.ownerCallOptions = bindExecutionSession(
      {
        causalParent,
        idempotencyKey: "operation:exact",
      },
      "admission:exact",
    );
    await expect(fixture.call("inspectOwnerAdmission")).resolves.toBeNull();
    const envelope = h.envelopes.find(
      (e) =>
        e.message.type === "request" &&
        e.message.method === "credentials.resolveCredential",
    );
    expect(envelope?.from).toBe(runtimeId);
    expect(envelope?.delivery.idempotencyKey).toBe("operation:exact");
    expect(envelope?.message).toMatchObject({
      executionSessionNonce: "admission:exact",
      causalParent,
    });
    expect(envelope?.message).not.toHaveProperty("authorityParentNonce");
  });

  it("native invocation RPC cannot inherit a transient caller authority parent", async () => {
    const h = await host();
    const fixture = await owner(h);
    h.handle("resolveCredential", async () => null);
    fixture.instance.ownerCallOptions = bindExecutionSession(
      {
        causalParent: {
          kind: "trajectory-invocation",
          logId: "owner",
          head: "main",
          invocationId: "invocation:native-exact",
        },
      },
      "admission:native-exact",
    );
    await expect(
      fixture.call("inspectNativeExecutionAdmission"),
    ).resolves.toBeNull();
    const message = h.envelopes.find(
      (e) =>
        e.message.type === "request" &&
        e.message.method === "resolveCredential",
    )?.message;
    expect(message).toMatchObject({
      executionSessionNonce: "admission:native-exact",
      causalParent: { invocationId: "invocation:native-exact" },
    });
    expect(message).not.toHaveProperty("authorityParentNonce");
  });

  it("keeps owner streaming independent while preserving its separately admitted context", async () => {
    const h = await host();
    const fixture = await owner(h);
    const bytes = new TextEncoder().encode("owned response");
    h.handle(
      "credentials.proxyFetch",
      async () =>
        new Response(
          Buffer.concat([
            encodeHeadFrame({
              status: 202,
              statusText: "Accepted",
              headerPairs: [],
              finalUrl: "https://provider.test/v1",
            }),
            encodeDataFrame(bytes),
            encodeEndFrame({ bytesIn: bytes.length }),
          ]),
        ),
    );
    const causalParent = {
      kind: "trajectory-invocation" as const,
      logId: "owner",
      head: "main",
      invocationId: "invocation:stream",
    };
    fixture.instance.ownerCallOptions = bindExecutionSession(
      {
        causalParent,
        idempotencyKey: "operation:stream",
      },
      "admission:stream",
    );
    await expect(fixture.call("inspectOwnerStream")).resolves.toEqual({
      status: 202,
      url: "https://provider.test/v1",
      body: "owned response",
    });
    const envelope = h.envelopes.find(
      (e) => e.message.type === "stream-request",
    );
    expect(envelope?.from).toBe(runtimeId);
    expect(envelope?.delivery.idempotencyKey).toBe("operation:stream");
    expect(envelope?.message).toMatchObject({
      executionSessionNonce: "admission:stream",
      causalParent,
    });
    expect(envelope?.message).not.toHaveProperty("authorityParentNonce");
  });

  it("keeps accepted model admission independent of the inbound authority and its reply", async () => {
    const h = await host();
    const fixture = await owner(h);
    const faux = fauxProvider();
    fixture.instance.models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage("done")]);
    let observe!: () => void;
    const reached = new Promise<void>((resolve) => {
      observe = resolve;
    });
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    h.handle("credentials.resolveCredential", async () => {
      observe();
      await held;
      return null;
    });
    fixture.instance.foregroundCanReturn = reached;
    let modelAuthority: unknown;
    fixture.instance.modelRequests = async (request) => {
      modelAuthority = fixture.instance.authorityProbe();
      await fixture.instance.probeCallerAdmission(request.model.baseUrl);
      return { status: "ready", options: {}, close: async () => {} };
    };
    const authorization = createTestDirectAuthority({
      callerKind: "server",
      method: "submitForScope",
      source,
      className: "Owner",
    });
    const accepted = fixture.callAs<{
      conversationId: string;
      authority: unknown;
    }>(
      { callerId: "main", callerKind: "server", authorization },
      "submitForScope",
    );
    try {
      await reached;
      const envelope = h.envelopes.find(
        (e) =>
          (e.message.type === "request" ||
            e.message.type === "stream-request") &&
          e.message.method === "credentials.resolveCredential",
      );
      expect(envelope?.from).toBe(runtimeId);
      expect(envelope?.message).not.toHaveProperty("authorityParentNonce");
      expect(modelAuthority).toBeNull();
      const result = await accepted;
      expect(result.conversationId).toBeTruthy();
      expect(result.authority).toEqual(authorization.context);
    } finally {
      finish();
      await accepted.catch(() => {});
      await (await fixture.instance.open()).waitForIdle(BACKGROUND_CONTEXT);
    }
  });

  it("refuses an omitted model request port before host or connection admission", async () => {
    const h = await host();
    const fixture = await owner(h);
    Object.defineProperty(fixture.instance, "agentOptions", {
      value: () => ({ registry: createRegistry(), models: createModels() }),
    });
    await expect(fixture.instance.open()).rejects.toThrow(
      "protected model request port",
    );
    expect(h.calls).toEqual([]);
    expect(
      fixture.sql.exec("SELECT COUNT(*) AS count FROM documents").toArray(),
    ).toEqual([{ count: 0 }]);
    expect(await fixture.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
  });

  it("passes generation through its required port and joins model cleanup before clearing its lifecycle lease", async () => {
    const h = await host();
    const fixture = await owner(h);
    const faux = fauxProvider();
    fixture.instance.models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage("done")]);
    let finish!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let observe!: () => void;
    const reached = new Promise<void>((resolve) => {
      observe = resolve;
    });
    fixture.instance.modelRequests = async (request) => {
      expect(request).toMatchObject({
        taskKind: "pi.generation",
        purpose: "generation",
        operation: "stream",
      });
      return {
        status: "ready",
        options: {},
        close: async () => {
          observe();
          await cleanup;
        },
      };
    };
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: "faux", modelId: "faux-1" } },
    });
    try {
      await root.submit({ type: "input", content: "go" }, BACKGROUND_CONTEXT);
      await reached;
      expect(fixture.instance.resources()).toHaveLength(1);
      const release = fixture.instance.releaseForLifecycle(releaseInput);
      let released = false;
      void release.then(() => {
        released = true;
      });
      await Promise.resolve();
      expect(released).toBe(false);
      expect(h.calls).not.toContain("workspace-state.lifecycleLeaseClear");
      finish();
      expect(await release).toEqual({ status: "ready" });
      expect(fixture.instance.resources()).toHaveLength(0);
      expect(h.calls.at(-1)).toBe("workspace-state.lifecycleLeaseClear");
    } finally {
      finish();
      await fixture.instance.releaseForLifecycle(releaseInput);
    }
  });

  it("binds model approval readiness on its invoking transaction and resumes after owner replacement", async () => {
    const h = await host();
    const first = await owner(h);
    const faux = fauxProvider();
    faux.setResponses([fauxAssistantMessage("done")]);
    first.instance.models.setProvider(faux.provider);
    const requests: unknown[] = [];
    const binding = "host-bound-approval";
    const port: ModelRequestPort = async (request, api, context) => {
      requests.push(request);
      const key = `approval:${request.taskId}`;
      const ready = await api.commit(async (tx) => {
        const receipt = await tx.doc(ReceiptDoc, key, null);
        if (receipt.result !== undefined) return true;
        await bindReceipt(tx, key, binding);
        await tx.appendEntry(request.conversationId, {
          kind: "test.approval-admission",
        });
        return false;
      }, context);
      return ready
        ? { status: "ready", options: {}, close: async () => {} }
        : { status: "waiting", condition: { kind: "receipt", key, binding } };
    };
    first.instance.modelRequests = port;
    const session = await first.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: "faux", modelId: "faux-1" } },
    });
    const submission = await root.submit(
      { type: "input", content: "go" },
      BACKGROUND_CONTEXT,
    );
    await session.runPass(BACKGROUND_CONTEXT);
    const [waiting] = (await session.inspect(BACKGROUND_CONTEXT)).tasks;
    expect(waiting?.record.state).toMatchObject({
      status: "waiting",
      checkpoint: { phase: "request" },
      condition: { kind: "receipt", binding },
    });
    const key = `approval:${waiting!.record.id}`;
    expect(await session.snapshot(ReceiptDoc, key, BACKGROUND_CONTEXT)).toEqual(
      {
        admitted: true,
        binding,
      },
    );
    expect(
      (await root.entries({}, 10, undefined, BACKGROUND_CONTEXT)).items.find(
        (entry) => entry.kind === "test.approval-admission",
      ),
    ).toMatchObject({ byTaskId: waiting!.record.id });
    expect(faux.state.callCount).toBe(0);
    expect(await first.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
    const next = await owner(h, {}, first.db);
    next.instance.models.setProvider(faux.provider);
    next.instance.modelRequests = port;
    const restored = await next.instance.open();
    await restored.runPass(BACKGROUND_CONTEXT);
    expect(requests).toHaveLength(1);
    await restored.commit(
      (tx) => acceptReceipt(tx, key, binding, { state: "decided" }),
      BACKGROUND_CONTEXT,
    );
    expect(
      (
        await (await restored.submission(
          submission.id,
          BACKGROUND_CONTEXT,
        ))!.wait(BACKGROUND_CONTEXT)
      ).status,
    ).toBe("done");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(faux.state.callCount).toBe(1);
    expect(
      h.calls.filter(
        (method) => method === "workspace-state.entity.resolveActive",
      ),
    ).toHaveLength(2);
  });

  it("retains a failed model connection after the task faults and refuses a successful lifecycle release", async () => {
    const h = await host();
    const fixture = await owner(h);
    const faux = fauxProvider();
    fixture.instance.models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage("done")]);
    const failure = new Error("Provider connection retirement unconfirmed");
    let closeCalls = 0;
    let domainReleases = 0;
    const connection = {
      status: "ready",
      options: {},
      close: async () => {
        closeCalls++;
        throw failure;
      },
    } as const;
    fixture.instance.modelRequests = async () => connection;
    fixture.instance.productRelease = async () => {
      domainReleases++;
      expect(fixture.instance.resources()).toEqual([
        {
          connection,
          request: expect.objectContaining({ purpose: "generation" }),
        },
      ]);
    };
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: "faux", modelId: "faux-1" } },
    });
    await root.submit({ type: "input", content: "go" }, BACKGROUND_CONTEXT);
    await root.waitForIdle(BACKGROUND_CONTEXT);
    expect(closeCalls).toBe(1);
    await expect(fixture.instance.open()).rejects.toThrow("sealed");
    const released = await fixture.instance.releaseForLifecycle(releaseInput);
    expect(released).toEqual({ status: "failed", detail: failure.message });
    expect(domainReleases).toBe(1);
    expect(h.calls).not.toContain("workspace-state.lifecycleLeaseClear");
    expect(await fixture.instance.releaseForLifecycle(releaseInput)).toEqual(
      released,
    );
    expect(closeCalls).toBe(1);
    expect(fixture.instance.resources()[0]?.connection).toBe(connection);
    await expect(session.root(BACKGROUND_CONTEXT)).rejects.toThrow(/closed/i);
  });

  it("retains a late acquired connection whose cleanup fails during lifecycle release", async () => {
    const h = await host();
    const fixture = await owner(h);
    const faux = fauxProvider();
    fixture.instance.models.setProvider(faux.provider);
    let entered!: () => void;
    const acquiring = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let aborted!: () => void;
    const cancelled = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    let acquire!: () => void;
    const acquired = new Promise<void>((resolve) => {
      acquire = resolve;
    });
    const failure = new Error("Late connection cleanup unconfirmed");
    let closeCalls = 0;
    const connection = {
      status: "ready",
      options: {},
      close: async () => {
        closeCalls++;
        throw failure;
      },
    } as const;
    fixture.instance.modelRequests = async (_request, _api, context) => {
      context.abortSignal!.addEventListener("abort", aborted, { once: true });
      entered();
      await acquired;
      return connection;
    };
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: "faux", modelId: "faux-1" } },
    });
    try {
      await root.submit({ type: "input", content: "go" }, BACKGROUND_CONTEXT);
      await acquiring;
      let released = false;
      const release = fixture.instance
        .releaseForLifecycle(releaseInput)
        .then((result) => {
          released = true;
          return result;
        });
      await cancelled;
      expect(released).toBe(false);
      expect(h.calls).not.toContain("workspace-state.lifecycleLeaseClear");
      acquire();
      expect(await release).toEqual({
        status: "failed",
        detail: failure.message,
      });
      expect(closeCalls).toBe(1);
      expect(fixture.instance.resources()[0]?.connection).toBe(connection);
      expect(h.calls).not.toContain("workspace-state.lifecycleLeaseClear");
    } finally {
      acquire();
      await fixture.instance.releaseForLifecycle(releaseInput);
    }
  });

  it("verifies the original pending tool after owner replacement before any wake opens the Session", async () => {
    const h = await host();
    h.setAgentBinding("channel:lookup");
    const first = await owner(h);
    const faux = fauxProvider();
    first.instance.models.setProvider(faux.provider);
    const registry = createRegistry();
    let session!: Harness;
    let retained: { taskId: number; invocationId: string } | undefined;
    const tool = defineTool({
      name: "retained",
      description: "Retained native invocation",
      parameters: Type.Object({}),
      cancel: async () => ({ content: [] }),
      execute: async (_args, api, context) => {
        const source = await retainNativeToolInvocation(
          session,
          api,
          {
            runtimeId,
            source: image.WORKER_SOURCE,
            className: "Owner",
            objectKey: "test-key",
            executionDigest: image.WORKER_EXECUTION_DIGEST,
          },
          <T>(method: string, args: unknown[]) =>
            first.instance.hostCall<T>(method, args),
          context,
        );
        retained = {
          taskId: api.taskId,
          invocationId: nativeInvocationId(source),
        };
        await api.commit(
          (tx) => bindReceipt(tx, "retained:wait", "original"),
          context,
        );
        return {
          wait: {
            kind: "receipt" as const,
            key: "retained:wait",
            binding: "original",
          },
          continuation: { original: true },
        };
      },
    });
    registry.install(
      defineExtension({ name: "retained-source-test", tools: [tool] }),
    );
    Object.defineProperty(first.instance, "agentOptions", {
      value: () => ({
        registry,
        models: first.instance.models,
        modelRequests: first.instance.modelRequests,
      }),
    });
    session = await first.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT, {
      agent: {
        model: { provider: "faux", modelId: faux.getModel().id },
        tools: [tool],
      },
    });
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("retained", {}, { id: "retained-call" })],
        { stopReason: "toolUse" },
      ),
    ]);
    await root.submit({ type: "input", content: "go" }, BACKGROUND_CONTEXT);
    await session.runPass(BACKGROUND_CONTEXT);
    expect(retained).toBeDefined();
    const retainedTask = await session.getTask(
      retained!.taskId as never,
      BACKGROUND_CONTEXT,
    );
    expect(
      retainedTask?.state,
      JSON.stringify(retainedTask?.state),
    ).toMatchObject({ status: "waiting" });
    expect(await first.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
    const next = await owner(h, {}, first.db);
    Object.defineProperty(next.instance, "agentOptions", {
      value: () => ({
        registry,
        models: first.instance.models,
        modelRequests: next.instance.modelRequests,
      }),
    });
    const observed = await next.callAs<unknown>(
      {
        callerId: "main",
        callerKind: "server",
        authorization: createTestDirectAuthority({
          callerKind: "server",
          method: "inspectNativeInvocationSource",
          source,
          className: "Owner",
        }),
      },
      "inspectNativeInvocationSource",
      retained!,
    );
    expect(observed).toMatchObject({
      source: {
        task: { taskId: retained!.taskId },
        owner: { runtimeId, authoritySessionId: "authority:owner-lifetime" },
      },
      status: "waiting",
    });
  });

  it("requires trusted schema evidence on request, alarm and hibernation before writing", async () => {
    const fixture = await createTestDO(Owner, image, { initialize: false });
    try {
      for (const route of [
        () => fixture.instance.open(),
        () => fixture.instance.alarm(),
        () => fixture.instance.webSocketMessage({} as WebSocket, "hello"),
        () =>
          fixture.instance.fetch(new Request("http://test/test-key/getState")),
      ]) {
        await expect(route()).rejects.toThrow(
          "trusted loaded-image schema descriptor",
        );
      }
      expect(
        fixture.sql
          .exec("SELECT name FROM sqlite_master WHERE type='table'")
          .toArray(),
      ).toEqual([]);
    } finally {
      fixture.db.close();
    }
  });

  it("verified provenance lookup restores its bound Session without submitting work", async () => {
    const h = await host();
    const fixture = await owner(h);
    h.setAgentBinding("channel:lookup");
    const inspect = () =>
      fixture.callAs<unknown>(
        {
          callerId: "main",
          callerKind: "server",
          authorization: createTestDirectAuthority({
            callerKind: "server",
            method: "inspectNativeInvocationSource",
            source,
            className: "Owner",
          }),
        },
        "inspectNativeInvocationSource",
        { taskId: 1, invocationId: "invocation:missing" },
      );
    expect(await inspect()).toBeNull();
    expect(h.calls).toContain("workspace-state.alarmSourceRegister");
    expect(
      fixture.sql.exec("SELECT count(*) AS count FROM tasks").toArray(),
    ).toEqual([{ count: 0 }]);
    const registrations = h.calls.filter(
      (method) => method === "workspace-state.alarmSourceRegister",
    ).length;
    expect(await inspect()).toBeNull();
    expect(
      h.calls.filter(
        (method) => method === "workspace-state.alarmSourceRegister",
      ),
    ).toHaveLength(registrations);
  });

  it("probes the entire composition without opening an execution owner", async () => {
    expect(await probe()).toMatchObject({
      className: "Owner",
      version: 1,
      freshSchemaFingerprint: expect.stringContaining("product_value"),
    });
  });

  it("rolls back Pi and product bootstrap together", async () => {
    const fixture = await createTestDO(
      Owner,
      {
        ...image,
        VIBESTUDIO_SCHEMA_DESCRIPTOR: await probe(),
        FAIL_PRODUCT_SCHEMA: true,
      },
      { initialize: false },
    );
    try {
      await expect(fixture.instance.open()).rejects.toThrow(
        "product schema failure",
      );
      expect(
        fixture.sql
          .exec("SELECT name FROM sqlite_master WHERE type='table'")
          .toArray(),
      ).toEqual([]);
    } finally {
      fixture.db.close();
    }
  });

  it("opens one Session and registers release before execution admission", async () => {
    const h = await host();
    const fixture = await owner(h);
    const [first, second] = await Promise.all([
      fixture.instance.open(),
      fixture.instance.open(),
    ]);
    expect(first).toBe(second);
    expect(h.calls.slice(0, 3)).toEqual([
      "workspace-state.entity.resolveActive",
      "workspace-state.alarmSourceRegister",
      "workspace-state.lifecycleLeaseUpsert",
    ]);
    expect(
      h.calls.filter((m) => m === "workspace-state.entity.resolveActive"),
    ).toHaveLength(1);
    await first.root(BACKGROUND_CONTEXT);
    expect(await fixture.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
    await expect(first.root(BACKGROUND_CONTEXT)).rejects.toThrow(/closed/i);
    await expect(fixture.instance.open()).rejects.toThrow("sealed");
    expect(h.calls.at(-1)).toBe("workspace-state.lifecycleLeaseClear");
  });

  it("refuses a retired host entity before registering or reconciling", async () => {
    const h = await host();
    const fixture = await owner(h);
    const before = fixture.db.export();
    h.setActive(null);
    await expect(fixture.instance.open()).rejects.toThrow(
      "active platform owner",
    );
    expect(fixture.db.export()).toEqual(before);
    expect(h.calls).toEqual(["workspace-state.entity.resolveActive"]);
    expect(await fixture.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
  });

  it("seals synchronously and joins an open already in flight", async () => {
    const h = await host();
    const fixture = await owner(h);
    let unblock!: () => void;
    const held = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let observed!: () => void;
    const reached = new Promise<void>((resolve) => {
      observed = resolve;
    });
    h.holdResolution(held, observed);
    const opening = fixture.instance.open();
    const openingOutcome = opening.catch((error) => error as Error);
    await reached;
    const releasing = fixture.instance.releaseForLifecycle(releaseInput);
    await expect(fixture.instance.open()).rejects.toThrow("sealed");
    let finished = false;
    void releasing.then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    unblock();
    expect(await openingOutcome).toBeInstanceOf(Error);
    expect(await releasing).toEqual({ status: "ready" });
    expect(
      h.calls.filter((m) => m === "workspace-state.lifecycleLeaseClear"),
    ).toHaveLength(1);
  });

  it("reopens committed history in a fresh activation of the same owner", async () => {
    const h = await host();
    const first = await owner(h);
    const session = await first.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT);
    await session.commit(
      (tx) =>
        tx.appendEntry(root.id, {
          kind: "test.history",
          data: { preserved: true },
        }),
      BACKGROUND_CONTEXT,
    );
    expect(await first.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
    const next = await owner(h, {}, first.db);
    const reopened = await next.instance.open();
    const conversation = await reopened.conversation(
      root.id,
      BACKGROUND_CONTEXT,
    );
    expect(
      (await conversation!.entries({}, 10, undefined, BACKGROUND_CONTEXT))
        .items,
    ).toHaveLength(1);
  });

  it("refuses a restored database under a new host incarnation without changing records", async () => {
    const h = await host();
    const first = await owner(h);
    await (await first.instance.open()).root(BACKGROUND_CONTEXT);
    await first.instance.releaseForLifecycle(releaseInput);
    const next = await owner(h, {}, first.db);
    const before = first.db.export();
    h.setIncarnation("host-two");
    await expect(next.instance.open()).rejects.toThrow(
      "Retired execution owner",
    );
    expect(first.db.export()).toEqual(before);
    expect(await next.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
  });

  it("never acknowledges release after uncertain connection confirmation", async () => {
    const h = await host();
    const fixture = await owner(h);
    await fixture.instance.open();
    fixture.instance.failConfirmation();
    const first = await fixture.instance.releaseForLifecycle(releaseInput);
    expect(first).toEqual({ status: "failed", detail: "confirmation failure" });
    expect(await fixture.instance.releaseForLifecycle(releaseInput)).toEqual(
      first,
    );
    expect(h.calls).not.toContain("workspace-state.lifecycleLeaseClear");
  });

  it("retries failed host lease clearing only after confirmed local release", async () => {
    const h = await host();
    const fixture = await owner(h);
    await fixture.instance.open();
    h.failClear();
    expect(await fixture.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "failed",
      detail: "lease clear unavailable",
    });
    expect(await fixture.instance.releaseForLifecycle(releaseInput)).toEqual({
      status: "ready",
    });
    expect(
      h.calls.filter((m) => m === "workspace-state.lifecycleLeaseClear"),
    ).toHaveLength(2);
    expect(
      h.calls.filter((m) => m === "workspace-state.entity.resolveActive"),
    ).toHaveLength(1);
  });

  it("authenticates the exact EvalDO and commits domain truth before acknowledging", async () => {
    const h = await host();
    const fixture = await owner(h);
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT);
    const runId = "native-run";
    const route = { runId, scopeKey: "finite-eval" };
    const accepted = {
      runId,
      runDigest: "a".repeat(64),
      authorityManifestDigest: "b".repeat(64),
      status: "accepted",
    };
    await session.commit(async (tx) => {
      await bindEvalRun(tx, runId, "binding:one", route, root.id);
      await recordEvalAdmission(tx, runId, accepted);
    }, BACKGROUND_CONTEXT);
    const result = { success: true, console: "domain output", returnValue: 42 };
    h.setReceipt({
      runId,
      runDigest: accepted.runDigest,
      resultDigest: "c".repeat(64),
      result,
      acknowledged: false,
    });
    let acknowledged = false;
    h.onAck(async () => {
      expect(
        (await session.snapshot(ReceiptDoc, runId, BACKGROUND_CONTEXT))?.result,
      ).toEqual(result);
      acknowledged = true;
    });
    await expect(
      fixture.callAs(
        {
          callerId: evalRuntimeId("someone-else", route.scopeKey),
          callerKind: "do",
        },
        "onEvalComplete",
        { runId, result: { returnValue: "forged" } },
      ),
    ).rejects.toThrow("does not belong");
    expect(h.calls).not.toContain("eval.receipt");
    expect(h.calls).not.toContain("eval.acknowledge");
    await expect(
      fixture.callAs(
        {
          callerId: evalRuntimeId(runtimeId, route.scopeKey),
          callerKind: "do",
        },
        "onEvalComplete",
        { runId, result: { returnValue: "forged" } },
      ),
    ).resolves.toEqual({ accepted: true });
    expect(acknowledged).toBe(true);
  });

  it("keeps early and pending hints unacknowledged and creates no unknown receipt", async () => {
    const h = await host();
    const fixture = await owner(h);
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT);
    const caller = {
      callerId: evalRuntimeId(runtimeId, "default"),
      callerKind: "do" as const,
    };
    await expect(
      fixture.callAs(caller, "onEvalComplete", { runId: "unknown" }),
    ).rejects.toThrow("no retained domain admission");
    expect(
      await session.snapshot(ReceiptDoc, "unknown", BACKGROUND_CONTEXT),
    ).toBeUndefined();
    await session.commit(
      (tx) =>
        bindEvalRun(
          tx,
          "pending",
          "binding:pending",
          { runId: "pending" },
          root.id,
        ),
      BACKGROUND_CONTEXT,
    );
    await expect(
      fixture.callAs(caller, "onEvalComplete", { runId: "pending" }),
    ).resolves.toEqual({ accepted: false });
    await session.commit(
      (tx) =>
        recordEvalAdmission(tx, "pending", {
          runId: "pending",
          runDigest: "a".repeat(64),
          authorityManifestDigest: "b".repeat(64),
          status: "accepted",
        }),
      BACKGROUND_CONTEXT,
    );
    await expect(
      fixture.callAs(caller, "onEvalComplete", { runId: "pending" }),
    ).resolves.toEqual({ accepted: false });
    expect(h.calls).not.toContain("eval.acknowledge");
  });

  it("recovers a lost exact acknowledgement through authenticated delivery after replacement", async () => {
    const h = await host();
    const first = await owner(h);
    const session = await first.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT);
    const runId = "lost-ack";
    await session.commit(async (tx) => {
      await bindEvalRun(tx, runId, "binding:lost", { runId }, root.id);
      await recordEvalAdmission(tx, runId, {
        runId,
        runDigest: "a".repeat(64),
        authorityManifestDigest: "b".repeat(64),
        status: "accepted",
      });
    }, BACKGROUND_CONTEXT);
    const result = { success: true, console: "retained", returnValue: 43 };
    h.setReceipt({
      runId,
      runDigest: "a".repeat(64),
      resultDigest: "c".repeat(64),
      result,
      acknowledged: false,
    });
    const caller = {
      callerId: evalRuntimeId(runtimeId, "default"),
      callerKind: "do" as const,
    };
    h.loseAck();
    await expect(
      first.callAs(caller, "onEvalComplete", { runId }),
    ).rejects.toThrow("acknowledgement response lost");
    expect(
      (await session.snapshot(ReceiptDoc, runId, BACKGROUND_CONTEXT))?.result,
    ).toEqual(result);
    await first.instance.releaseForLifecycle(releaseInput);
    const next = await owner(h, {}, first.db);
    const reopened = await next.instance.open();
    const failed = (await reopened.inspect(BACKGROUND_CONTEXT)).tasks.find(
      (task) => task.record.kind === "vibestudio.eval-acknowledgement",
    )?.record;
    if (
      !failed ||
      failed.state.status !== "waiting" ||
      failed.state.condition.kind !== "failure"
    )
      throw new Error(
        "Lost acknowledgement has no exact owned repair incident",
      );
    await reopened.retryTask(
      failed.id,
      failed.state.condition.incident,
      BACKGROUND_CONTEXT,
    );
    await expect(
      next.callAs(caller, "onEvalComplete", { runId }),
    ).resolves.toEqual({ accepted: true });
    expect(
      (
        await (
          await next.instance.open()
        ).snapshot(ReceiptDoc, runId, BACKGROUND_CONTEXT)
      )?.result,
    ).toEqual(result);
    expect(
      h.calls.filter((method) => method === "eval.acknowledge"),
    ).toHaveLength(2);
  });

  it("keeps domain settlement serviceable while terminal resource cleanup is joined", async () => {
    const h = await host();
    const fixture = await owner(h);
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT);
    const runId = "retiring-run";
    await session.commit(async (tx) => {
      await bindEvalRun(tx, runId, "binding:retiring", { runId }, root.id);
      await recordEvalAdmission(tx, runId, {
        runId,
        runDigest: "a".repeat(64),
        authorityManifestDigest: "b".repeat(64),
        status: "accepted",
      });
    }, BACKGROUND_CONTEXT);
    const result = { success: false, console: "", error: "cancelled" };
    h.setReceipt({
      runId,
      runDigest: "a".repeat(64),
      resultDigest: "c".repeat(64),
      result,
      acknowledged: false,
    });
    let completed!: () => void;
    const resource = new Promise<void>((resolve) => {
      completed = resolve;
    });
    let observed!: () => void;
    const reached = new Promise<void>((resolve) => {
      observed = resolve;
    });
    fixture.instance.productRelease = async (input) => {
      expect(input.mode).toBe("retire");
      observed();
      await resource;
    };
    h.onAck(async () => {
      expect(
        (await session.snapshot(ReceiptDoc, runId, BACKGROUND_CONTEXT))?.result,
      ).toEqual(result);
      completed();
    });
    const release = fixture.instance.releaseForLifecycle({
      ...releaseInput,
      mode: "retire",
    });
    await reached;
    expect(h.calls).not.toContain("workspace-state.lifecycleLeaseClear");
    await expect(fixture.instance.open()).rejects.toThrow("sealed");
    await expect(
      fixture.callAs(
        { callerId: evalRuntimeId(runtimeId, "default"), callerKind: "do" },
        "onEvalComplete",
        { runId },
      ),
    ).resolves.toEqual({ accepted: true });
    expect(await release).toEqual({ status: "ready" });
    expect(h.calls.at(-1)).toBe("workspace-state.lifecycleLeaseClear");
  });

  it("retains its lease and retries the owner's cleanup after a domain refusal", async () => {
    const h = await host();
    const fixture = await owner(h);
    await fixture.instance.open();
    fixture.instance.productRelease = async () => {
      throw new Error("domain cleanup remains pending");
    };
    expect(
      await fixture.instance.releaseForLifecycle({
        ...releaseInput,
        mode: "retire",
      }),
    ).toEqual({ status: "failed", detail: "domain cleanup remains pending" });
    expect(h.calls).not.toContain("workspace-state.lifecycleLeaseClear");
    fixture.instance.productRelease = async () => {};
    expect(
      await fixture.instance.releaseForLifecycle({
        ...releaseInput,
        mode: "retire",
      }),
    ).toEqual({ status: "ready" });
  });
});

describe("native canonical authority receipts", () => {
  it("withdraws a pending acquisition only after its original native task is aborted", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const f = await authorityOwner(h, authority);
    await f.start();
    await f.fixture.call("onAuthorityChanged", authority.info.acquisitionId);
    expect(authority.withdrawals).toEqual([]);
    await f.root.abort(BACKGROUND_CONTEXT);
    authority.onAck(async () => {
      expect(
        (
          await f.session.snapshot(
            ReceiptDoc,
            authority.info.acquisitionId,
            BACKGROUND_CONTEXT,
          )
        )?.result,
      ).toEqual({ state: "closed", reason: "operation-ended" });
    });
    await f.fixture.instance.alarm();
    expect(authority.withdrawals).toHaveLength(1);
    expect(authority.acknowledgements).toHaveLength(1);
    expect(f.faux.state.callCount).toBe(0);
    await f.fixture.instance.alarm();
    expect(authority.withdrawals).toHaveLength(1);
  });

  it("withdraws committed approval on the original port failure before propagating that error", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const original = new Error(
      "Provider preparation failed after acquisition admission",
    );
    const f = await authorityOwner(h, authority, undefined, (api) => ({
      ...api,
      commit: async (change, context) => {
        await api.commit(change, context);
        throw original;
      },
    }));
    await f.start();
    expect(f.errors).toEqual([original]);
    expect(authority.withdrawals).toHaveLength(1);
    expect(authority.acknowledgements).toEqual([]);
    expect(
      (
        await f.session.snapshot(
          ReceiptDoc,
          authority.info.acquisitionId,
          BACKGROUND_CONTEXT,
        )
      )?.result,
    ).toEqual({ state: "closed", reason: "operation-ended" });
    const task = await f.session.getTask(
      f.requests[0]!.taskId,
      BACKGROUND_CONTEXT,
    );
    expect(task?.state).toMatchObject({
      status: "terminal",
      outcome: { status: "faulted", error: { message: original.message } },
    });
    await f.fixture.instance.alarm();
    expect(authority.acknowledgements).toHaveLength(1);
    expect(f.faux.state.callCount).toBe(0);
    expect(authority.withdrawals).toHaveLength(1);
  });

  it("preserves original port and withdrawal errors and redrives closure from durable terminal state", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const original = new Error("Original model preparation failure");
    const closure = new Error("Canonical acquisition closure refused");
    authority.failWithdrawal(closure);
    const f = await authorityOwner(h, authority, undefined, (api) => ({
      ...api,
      commit: async (change, context) => {
        await api.commit(change, context);
        throw original;
      },
    }));
    await f.start();
    const task = await f.session.getTask(
      f.requests[0]!.taskId,
      BACKGROUND_CONTEXT,
    );
    expect(task?.state).toMatchObject({
      status: "terminal",
      outcome: {
        status: "faulted",
        error: {
          message: "Model request failed and authority withdrawal failed",
          detail: { errors: [original.message, closure.message] },
        },
      },
    });
    expect(f.errors).toEqual([original]);
    expect(authority.withdrawals).toHaveLength(1);
    expect(authority.acknowledgements).toEqual([]);
    await expect(f.fixture.instance.alarm()).rejects.toThrow(closure.message);
    expect(authority.acknowledgements).toEqual([]);
    authority.failWithdrawal(undefined);
    await f.fixture.instance.alarm();
    expect(authority.acknowledgements).toHaveLength(1);
    expect(f.faux.state.callCount).toBe(0);
  });

  it("keeps abort-cleanup approval actionable until actual deferred cancellation ends", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const fixture = await owner(h);
    const faux = fauxProvider({ deferred: { pollAfterMs: 60_000 } });
    faux.setResponses([fauxAssistantMessage("done")]);
    fixture.instance.models.setProvider(faux.provider);
    fixture.instance.settings = { stream: { deferred: true } };
    let cleanupParked!: () => void;
    const parked = new Promise<void>((resolve) => {
      cleanupParked = resolve;
    });
    fixture.instance.modelRequests = async (request, api, context) => {
      if (request.operation !== "cancelDeferred")
        return { status: "ready", options: {}, close: async () => {} };
      const ready = await session.snapshot(
        ReceiptDoc,
        authority.info.acquisitionId,
        context,
      );
      if (ready?.result !== undefined)
        return { status: "ready", options: {}, close: async () => {} };
      const wait = await fixture.instance.authorityWait(
        request,
        api,
        authority.info,
        authorityInvocation,
        context,
      );
      cleanupParked();
      return wait;
    };
    const session = await fixture.instance.open();
    const root = await session.root(BACKGROUND_CONTEXT, {
      agent: { model: { provider: "faux", modelId: "faux-1" } },
    });
    await root.submit({ type: "input", content: "go" }, BACKGROUND_CONTEXT);
    await session.runPass(BACKGROUND_CONTEXT);
    const abort = root.abort(BACKGROUND_CONTEXT);
    await parked;
    await expect(
      fixture.call("onAuthorityChanged", authority.info.acquisitionId),
    ).resolves.toEqual({ accepted: false });
    expect(authority.withdrawals).toEqual([]);
    expect(faux.state.cancelledDeferred).toEqual([]);
    authority.settle();
    await fixture.call("onAuthorityChanged", authority.info.acquisitionId);
    await abort;
    expect(faux.state.cancelledDeferred).toHaveLength(1);
    expect(authority.withdrawals).toEqual([]);
  });

  it("retains the exact authenticated host authority session without deriving one from runtime identity", async () => {
    const h = await host();
    const authority = authorityHost(h, "host-owned:incarnation-bound-session");
    const f = await authorityOwner(h, authority);
    await f.start();
    const terminal = authority.settle();
    await f.fixture.call("onAuthorityChanged", terminal.acquisitionId);
    await f.session.waitForIdle(BACKGROUND_CONTEXT);
    expect(f.errors).toEqual([]);
    expect(f.faux.state.callCount).toBe(1);
    expect(authority.acknowledgements).toHaveLength(1);
  });
  it("parks on invocation-bound approval without a resident wait and refuses foreign hints", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const f = await authorityOwner(h, authority);
    await f.start();
    expect(f.errors).toEqual([]);
    expect(f.faux.state.callCount).toBe(0);
    const [task] = (await f.session.inspect(BACKGROUND_CONTEXT)).tasks;
    expect(task?.record.state).toMatchObject({
      status: "waiting",
      condition: {
        kind: "receipt",
        key: authority.info.acquisitionId,
        binding: authority.pending.bindingDigest,
      },
    });
    expect(
      await f.session.snapshot(
        ReceiptDoc,
        authority.info.acquisitionId,
        BACKGROUND_CONTEXT,
      ),
    ).toEqual({
      admitted: true,
      binding: authority.pending.bindingDigest,
    });
    const reads = h.calls.filter(
      (method) => method === "authority.acquisitionReceipt",
    ).length;
    await expect(
      f.fixture.callAs(
        { callerId: "electron-main", callerKind: "shell" },
        "onAuthorityChanged",
        authority.info.acquisitionId,
      ),
    ).rejects.toThrow(/host|author|principal|denied/i);
    expect(
      h.calls.filter((method) => method === "authority.acquisitionReceipt"),
    ).toHaveLength(reads);
    await expect(
      f.fixture.call("onAuthorityChanged", authority.info.acquisitionId),
    ).resolves.toEqual({ accepted: false });
    expect(authority.acknowledgements).toEqual([]);
    expect(h.calls).not.toContain("authority.awaitDecision");
  });

  it("creates no binding or host acknowledgement for an unknown hint", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const f = await authorityOwner(h, authority);
    await expect(
      f.fixture.call("onAuthorityChanged", "acq:unknown"),
    ).rejects.toThrow("no retained domain admission");
    expect(
      await f.session.snapshot(ReceiptDoc, "acq:unknown", BACKGROUND_CONTEXT),
    ).toBeUndefined();
    expect(h.calls).not.toContain("authority.acquisitionReceipt");
    expect(authority.acknowledgements).toEqual([]);
  });

  it.each(["decided", "closed", "failed"] as const)(
    "commits the canonical %s outcome before exact host acknowledgement",
    async (state) => {
      const h = await host();
      const authority = authorityHost(h);
      const f = await authorityOwner(h, authority);
      await f.start();
      const terminal = authority.settle(state);
      authority.onAck(async () => {
        expect(
          (
            await f.session.snapshot(
              ReceiptDoc,
              terminal.acquisitionId,
              BACKGROUND_CONTEXT,
            )
          )?.result,
        ).toEqual(terminal.resolution);
      });
      await expect(
        f.fixture.call("onAuthorityChanged", terminal.acquisitionId),
      ).resolves.toEqual({ accepted: true });
      expect(authority.acknowledgements).toEqual([
        [
          {
            acquisitionId: terminal.acquisitionId,
            resolutionDigest: terminal.resolutionDigest,
          },
        ],
      ]);
      await expect(
        f.fixture.call("onAuthorityChanged", terminal.acquisitionId),
      ).resolves.toEqual({ accepted: true });
      expect(authority.acknowledgements).toHaveLength(2);
    },
  );

  it("reconciles a lost acknowledgement after owner replacement without repeating model work", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const first = await authorityOwner(h, authority);
    const submission = await first.start();
    const terminal = authority.settle();
    authority.loseAck();
    await expect(
      first.fixture.call("onAuthorityChanged", terminal.acquisitionId),
    ).rejects.toThrow("Authority acknowledgement response lost");
    expect(
      (
        await first.session.snapshot(
          ReceiptDoc,
          terminal.acquisitionId,
          BACKGROUND_CONTEXT,
        )
      )?.result,
    ).toEqual(terminal.resolution);
    await first.session.waitForIdle(BACKGROUND_CONTEXT);
    expect(first.faux.state.callCount).toBe(1);
    await first.fixture.instance.releaseForLifecycle(releaseInput);
    const next = await authorityOwner(h, authority, first.fixture.db);
    await next.fixture.instance.alarm();
    expect(authority.acknowledgements).toHaveLength(2);
    expect(authority.acknowledgements[1]).toEqual(
      authority.acknowledgements[0],
    );
    expect(
      (
        await (await next.session.submission(
          submission.id,
          BACKGROUND_CONTEXT,
        ))!.wait(BACKGROUND_CONTEXT)
      ).status,
    ).toBe("done");
    expect(next.faux.state.callCount).toBe(0);
  });

  it("refuses changed canonical admission, invocation or result without acknowledging it", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const f = await authorityOwner(h, authority);
    await f.start();
    const terminal = authority.settle();
    const alteredAdmissions: AuthorityAcquisitionReceipt[] = [
      { ...terminal, bindingDigest: "e".repeat(64) },
      {
        ...terminal,
        admission: { ...terminal.admission, sessionId: "another-session" },
      },
      {
        ...terminal,
        invocations: [
          {
            ...terminal.invocations[0]!,
            preparedStateDigest: "different-state",
          },
        ],
      },
    ];
    for (const altered of alteredAdmissions) {
      authority.replace(altered);
      await expect(
        f.fixture.call("onAuthorityChanged", terminal.acquisitionId),
      ).rejects.toThrow("conflicts with its retained admission");
      expect(
        (
          await f.session.snapshot(
            ReceiptDoc,
            terminal.acquisitionId,
            BACKGROUND_CONTEXT,
          )
        )?.result,
      ).toBeUndefined();
      expect(authority.acknowledgements).toEqual([]);
    }
    authority.replace(terminal);
    await f.fixture.call("onAuthorityChanged", terminal.acquisitionId);
    authority.replace({ ...terminal, resolutionDigest: "e".repeat(64) });
    await expect(
      f.fixture.call("onAuthorityChanged", terminal.acquisitionId),
    ).rejects.toThrow("retained outcome");
    expect(authority.acknowledgements).toHaveLength(1);
    authority.replace({
      ...terminal,
      resolution: { state: "decided", decision: "deny" },
    });
    await expect(
      f.fixture.call("onAuthorityChanged", terminal.acquisitionId),
    ).rejects.toThrow(/different|conflict|result/i);
    expect(authority.acknowledgements).toHaveLength(1);
  });

  it("rejects foreign image or invocation admission before creating a Pi receipt", async () => {
    for (const field of [
      "image",
      "args",
      "session",
      "lifetime",
      "snapshot",
    ] as const) {
      const h = await host();
      const authority = authorityHost(h);
      const pending = authority.pending;
      const original = pending.invocations[0]!;
      authority.replace({
        ...pending,
        ...(field === "session" || field === "lifetime"
          ? {
              admission: { ...pending.admission, sessionId: "foreign-session" },
            }
          : {}),
        invocations: [
          {
            ...original,
            ...(field === "lifetime" ? { sessionId: "foreign-session" } : {}),
            ...(field === "image"
              ? { code: { ...original.code!, executionDigest: "f".repeat(64) } }
              : {}),
            ...(field === "args" ? { argsDigest: "f".repeat(64) } : {}),
            ...(field === "snapshot" ? { snapshotDigest: "f".repeat(64) } : {}),
          },
        ],
      });
      const f = await authorityOwner(h, authority);
      await f.start();
      expect(f.errors).toHaveLength(1);
      expect(
        await f.session.snapshot(
          ReceiptDoc,
          pending.acquisitionId,
          BACKGROUND_CONTEXT,
        ),
      ).toBeUndefined();
      expect(authority.acknowledgements).toEqual([]);
      expect(f.faux.state.callCount).toBe(0);
    }
  });

  it("closes canonical original model authority after binding rollback and actual task termination", async () => {
    const h = await host();
    h.setAgentBinding("channel:owner");
    const authority = authorityHost(h);
    const failure = new Error("Original model admission commit failure");
    const f = await authorityOwner(h, authority, undefined, (api) => {
      const request = f.requests.at(-1)!;
      const nativeInvocation = {
        owner: { runtimeId, authoritySessionId: "authority:owner-lifetime" },
        task: {
          taskId: request.taskId,
          conversationId: request.conversationId,
        },
        operation: {
          kind: "model" as const,
          purpose: "generation" as const,
          attempt: request.attempt,
          cutoff: request.cutoff,
        },
      };
      const trajectory = channelTrajectoryFor("channel:owner");
      authority.replace(
        authorityAcquisitionReceiptSchema.parse({
          ...authority.pending,
          invocations: authority.pending.invocations.map((invocation) => ({
            ...invocation,
            nativeInvocation,
            causalParent: {
              kind: "trajectory-invocation",
              logId: trajectory.logId,
              head: trajectory.head,
              invocationId: nativeInvocationId(nativeInvocation),
            },
          })),
        }),
      );
      return {
        ...api,
        commit: (change, context) =>
          api.commit(async (tx) => {
            await change(tx);
            throw failure;
          }, context),
      };
    });
    await f.start();
    expect(f.errors).toEqual([failure]);
    expect(
      await f.session.snapshot(
        ReceiptDoc,
        authority.info.acquisitionId,
        BACKGROUND_CONTEXT,
      ),
    ).toBeUndefined();
    expect(
      f.fixture.sql
        .exec(
          "SELECT COUNT(*) AS count FROM documents WHERE kind = 'vibestudio.authority-admission'",
        )
        .toArray(),
    ).toEqual([{ count: 0 }]);
    expect(authority.acknowledgements).toEqual([]);
    const original = await f.session.getTask(
      f.requests[0]!.taskId,
      BACKGROUND_CONTEXT,
    );
    expect(original?.state.status).toBe("terminal");
    expect(original?.input).toEqual({});
    await f.fixture.instance.alarm();
    expect(authority.current()?.state).toBe("closed");
    expect(authority.withdrawals).toEqual([
      [
        {
          acquisitionId: authority.info.acquisitionId,
          bindingDigest: authority.pending.bindingDigest,
        },
      ],
    ]);
    expect(authority.acknowledgements).toHaveLength(1);
    expect(
      (
        await f.session.snapshot(
          ReceiptDoc,
          authority.info.acquisitionId,
          BACKGROUND_CONTEXT,
        )
      )?.result,
    ).toEqual(
      (() => {
        const value = authority.current();
        return value && value.state !== "pending"
          ? value.resolution
          : undefined;
      })(),
    );
    await f.fixture.instance.alarm();
    expect(authority.withdrawals).toHaveLength(1);
    expect(authority.acknowledgements).toHaveLength(1);
  });

  it("keeps a decision preceding park durable and acknowledges it through owner reconciliation", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const terminal = authority.settle();
    const f = await authorityOwner(h, authority);
    const submission = await f.start();
    expect(f.errors).toEqual([]);
    expect(
      (
        await f.session.snapshot(
          ReceiptDoc,
          terminal.acquisitionId,
          BACKGROUND_CONTEXT,
        )
      )?.result,
    ).toEqual(terminal.resolution);
    expect(authority.acknowledgements).toEqual([]);
    await f.fixture.instance.alarm();
    await f.session.waitForIdle(BACKGROUND_CONTEXT);
    expect(
      (
        await (await f.session.submission(
          submission.id,
          BACKGROUND_CONTEXT,
        ))!.wait(BACKGROUND_CONTEXT)
      ).status,
    ).toBe("done");
    expect(f.faux.state.callCount).toBe(1);
    expect(authority.acknowledgements).toHaveLength(1);
  });

  it("reconciles settlement between the initial canonical read and invocation commit", async () => {
    const h = await host();
    const authority = authorityHost(h);
    let firstCommit = true;
    const f = await authorityOwner(h, authority, undefined, (api) => ({
      ...api,
      commit: async (change, context) => {
        if (firstCommit) {
          firstCommit = false;
          authority.settle();
        }
        return api.commit(change, context);
      },
    }));
    const submission = await f.start();
    await f.session.waitForIdle(BACKGROUND_CONTEXT);
    expect(f.errors).toEqual([]);
    expect(
      h.calls.filter((method) => method === "authority.acquisitionReceipt"),
    ).toHaveLength(2);
    expect(
      (
        await (await f.session.submission(
          submission.id,
          BACKGROUND_CONTEXT,
        ))!.wait(BACKGROUND_CONTEXT)
      ).status,
    ).toBe("done");
    expect(f.faux.state.callCount).toBe(1);
    expect(authority.acknowledgements).toEqual([]);
    await f.fixture.instance.alarm();
    expect(authority.acknowledgements).toHaveLength(1);
  });

  it("traverses canonical pages without admitting or acknowledging foreign receipt IDs", async () => {
    const h = await host();
    const authority = authorityHost(h);
    const f = await authorityOwner(h, authority);
    await f.start();
    const terminal = authority.settle();
    const unknown = Array.from({ length: 64 }, (_, index) => ({
      ...terminal,
      acquisitionId: `acq:unknown:${String(index).padStart(2, "0")}`,
      createdAt: 0,
    }));
    const last = unknown.at(-1)!;
    const cursor = {
      createdAt: last.createdAt,
      acquisitionId: last.acquisitionId,
    };
    const pages: unknown[][] = [];
    h.handle("authority.outstandingAcquisitions", async (args) => {
      pages.push(args);
      if (args[0] && typeof args[0] === "object" && "after" in args[0]) {
        expect(args).toEqual([{ after: cursor }]);
        return { receipts: pages.length === 2 ? [terminal] : [], next: null };
      }
      return { receipts: unknown, next: cursor };
    });
    await f.fixture.instance.alarm();
    await f.session.waitForIdle(BACKGROUND_CONTEXT);
    expect(pages).toEqual([
      [{}],
      [{ after: cursor }],
      [{}],
      [{ after: cursor }],
    ]);
    expect(authority.acknowledgements).toEqual([
      [
        {
          acquisitionId: terminal.acquisitionId,
          resolutionDigest: terminal.resolutionDigest,
        },
      ],
    ]);
    for (const receipt of unknown)
      expect(
        await f.session.snapshot(
          ReceiptDoc,
          receipt.acquisitionId,
          BACKGROUND_CONTEXT,
        ),
      ).toBeUndefined();
    expect(f.faux.state.callCount).toBe(1);
  });
});
