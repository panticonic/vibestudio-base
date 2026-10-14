import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  MemoryStorage,
  type Harness,
} from "@panticonic/pi-durable";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import type { AuthorityAcquisitionReceipt } from "@vibestudio/service-schemas/authority";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { RpcBoundaryError } from "@vibestudio/rpc";
import {
  nativeInvocationId,
  nativeInvocationIdentity,
} from "@vibestudio/service-schemas/nativeInvocation";
import { channelTrajectoryFor } from "@vibestudio/trajectory-identity";
import {
  completeNativeModelHelper,
  NativeModelHelperTask,
} from "./native-model-helper.js";
import {
  nativeRunWaitPresentation,
  type NativeWaitNotice,
} from "./native-wait-presentation.js";
import { retainNativeModelInvocation } from "./native-invocation-source.js";
import { openNativeChannelConversation } from "./native-channel-session.js";
import {
  createProtectedModelProvider,
  notifyModelCredentialChange,
} from "./native-model-provider.js";
import { openPlatformAgentSession } from "./native-agent-session.js";
import { openBoundAgentSession } from "./native-agent-session.js";
import {
  bindAuthorityAcquisition,
  consumeAuthorityReceipt,
  reconcileAuthorityReceipts,
} from "./native-authority-receipts.js";

const context = BACKGROUND_CONTEXT;
const owner = {
  runtimeId: "do:workers/agent:Agent:one",
  contextId: "context:one",
  incarnation: "storage:one",
  authoritySessionId: "lifetime:one",
};
const image = {
  runtimeId: owner.runtimeId,
  source: "workers/agent",
  className: "Agent",
  objectKey: "one",
  executionDigest: "a".repeat(64),
};
const invocation = {
  service: "models",
  method: "stream",
  args: ["original protected request"],
};
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((harness) => harness.close(context)),
  );
});

async function parkedApproval() {
  const notices: (NativeWaitNotice | null)[] = [];
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("done")]);
  const models = createModels();
  models.setProvider(faux.provider);
  let receipt: AuthorityAcquisitionReceipt = {
    acquisitionId: "approval:one",
    bindingDigest: "b".repeat(64),
    createdAt: 1,
    state: "pending",
    admission: {
      requestKey: "protected:one",
      ownerRuntimeId: owner.runtimeId,
      sessionId: owner.authoritySessionId,
      facts: {},
    },
    invocations: [
      {
        nativeInvocation: null,
        causalParent: null,
        ownerRuntimeId: owner.runtimeId,
        sessionId: owner.authoritySessionId,
        code: {
          repoPath: image.source,
          effectiveVersion: "state:old",
          executionDigest: image.executionDigest,
        },
        service: invocation.service,
        method: invocation.method,
        argsDigest: sha256HexSyncText(canonicalJson(invocation.args)),
        preparedStateDigest: "prepared:one",
        snapshotDigest: "c".repeat(64),
        capability: "models",
        resourceKey: "request:one",
      },
    ],
  };
  const acknowledged: unknown[] = [];
  const call = createMainRpcCaller(
    schemaRpcMock({
      call: async (_target, method, args) => {
        if (method === "authority.acquisitionReceipt")
          return structuredClone(receipt);
        if (method === "authority.acknowledgeAcquisition") {
          acknowledged.push(args);
          return { acknowledged: true };
        }
        throw new Error(`unexpected host call ${method}`);
      },
    }),
  );
  let harness!: Harness;
  let taskId: number | undefined;
  harness = await openBoundAgentSession(
    new MemoryStorage(),
    { ...owner, generation: 1 },
    {
      models,
      registry: createRegistry(),
      publishWake: async () => {},
      prepareCommit: async (tx, staged) => {
        if (taskId !== undefined) {
          const notice = await nativeRunWaitPresentation(
            tx,
            staged,
            taskId as import("@panticonic/pi-durable").TaskId,
          );
          notices.push(
            notice ? { reason: notice.reason, summary: notice.summary } : null,
          );
        }
      },
      modelRequests: async (request, api, ctx) => {
        taskId = request.taskId;
        if (receipt.state !== "pending")
          return { status: "ready", options: {}, close: async () => {} };
        return bindAuthorityAcquisition(
          harness,
          api,
          request,
          {
            acquisitionId: receipt.acquisitionId,
            ownerRuntimeId: owner.runtimeId,
            snapshotDigest: "c".repeat(64),
            capability: "models",
            resourceKey: "request:one",
            tier: "gated",
            cardType: "permission.gated",
            renderedAction: "Original model request",
            pending: true,
          },
          invocation,
          image,
          call,
          ctx,
        );
      },
    },
    context,
  );
  sessions.push(harness);
  const root = await harness.root(context, {
    agent: { model: { provider: "faux", modelId: faux.getModel().id } },
  });
  let unsubscribe = () => {};
  const waiting = new Promise<void>((resolve) => {
    unsubscribe = harness.subscribeCommits((publication) => {
      if (
        publication.changes.some(
          (change) =>
            change.type === "task" &&
            change.value.id === taskId &&
            change.value.state.status === "waiting",
        )
      )
        resolve();
    });
  });
  try {
    await root.submit({ type: "input", content: "request" }, context);
    await waiting;
  } finally {
    unsubscribe();
  }
  return {
    harness,
    call,
    acknowledged,
    notices,
    receipt: () => receipt,
    settle: () => {
      receipt = {
        ...receipt,
        state: "decided",
        resolution: {
          decision: "allowed",
          protectedExecutionDigest: image.executionDigest,
        },
        resolutionDigest: "d".repeat(64),
        settledAt: 2,
      };
    },
  };
}

async function nativeHelperApproval(gated: boolean, credentialSetup = false) {
  let credentialConnected = !credentialSetup;
  const notices: (NativeWaitNotice | null)[] = [];
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("approved helper answer")]);
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "helper-authority",
      tasks: [NativeModelHelperTask],
    }),
  );
  let receipt!: AuthorityAcquisitionReceipt;
  let harness!: Harness;
  const acknowledged: unknown[] = [];
  const call = createMainRpcCaller(
    schemaRpcMock({
      call: async (_target, method, args) => {
        if (method === "workspace-state.alarmSourcePublish") return "accepted";
        if (method === "authority.acquisitionReceipt")
          return structuredClone(receipt);
        if (method === "authority.outstandingAcquisitions")
          return { receipts: [structuredClone(receipt)], next: null };
        if (method === "authority.acknowledgeAcquisition") {
          acknowledged.push(args);
          return { acknowledged: true };
        }
        throw new Error(`Unexpected helper authority host call ${method}`);
      },
    }),
  );
  const acquisition = {
    acquisitionId: "approval:helper",
    ownerRuntimeId: owner.runtimeId,
    snapshotDigest: "c".repeat(64),
    capability: "model.use",
    resourceKey: "model:helper",
    tier: "gated" as const,
    cardType: "permission.gated",
    renderedAction: "use the selected model",
    pending: true,
    ...(credentialSetup
      ? {
          existingReview: {
            approvalId: "review:welcome",
            title: "Welcome — here's what's in your workspace",
          },
        }
      : {}),
  };
  const rpc = schemaRpcMock({
    call: async (_target, method) => {
      if (method !== "credentials.resolveNativeModel")
        throw new Error(`Unexpected helper model RPC ${method}`);
      if (gated && receipt.state === "pending")
        throw new RpcBoundaryError(
          "Approve model use",
          "access",
          "EACQUIRE",
          undefined,
          { acquisition },
        );
      if (!credentialConnected) return null;
      return {
        id: "model-credential",
        label: "Model",
        audience: [],
        injection: {
          type: "header",
          name: "authorization",
          valueTemplate: "Bearer {token}",
        },
        scopes: [],
        lifecycle: { state: "active", canRefresh: false },
      };
    },
  });
  const port = createProtectedModelProvider({
    rpcForRequest: async (request, api, ctx) => {
      const source = await retainNativeModelInvocation(
        harness,
        request,
        api,
        image,
        ctx,
      );
      if (!receipt) {
        const identity = nativeInvocationIdentity(source);
        const trajectory = channelTrajectoryFor("channel:helper");
        const args = [
          {
            providerId: request.model.provider,
            modelId: request.model.id,
            endpoint: request.model.baseUrl ?? null,
          },
        ];
        receipt = {
          acquisitionId: acquisition.acquisitionId,
          bindingDigest: "b".repeat(64),
          createdAt: 1,
          state: "pending",
          admission: {
            requestKey: "helper-model",
            ownerRuntimeId: owner.runtimeId,
            sessionId: owner.authoritySessionId,
            facts: {},
          },
          invocations: [
            {
              nativeInvocation: identity,
              causalParent: {
                kind: "trajectory-invocation",
                logId: trajectory.logId,
                head: trajectory.head,
                invocationId: nativeInvocationId(source),
                nativeInvocation: identity,
              },
              ownerRuntimeId: owner.runtimeId,
              sessionId: owner.authoritySessionId,
              code: {
                repoPath: image.source,
                effectiveVersion: "state:one",
                executionDigest: image.executionDigest,
              },
              service: "credentials",
              method: "resolveNativeModel",
              argsDigest: sha256HexSyncText(canonicalJson(args)),
              preparedStateDigest: "prepared:helper",
              snapshotDigest: acquisition.snapshotDigest,
              capability: acquisition.capability,
              resourceKey: acquisition.resourceKey,
            },
          ],
        };
      }
      return { rpc, cleanupRpc: rpc };
    },
    egressFetch: fetch,
    waitForAuthority: (request, api, info, invocation, ctx) =>
      bindAuthorityAcquisition(
        harness,
        api,
        request,
        info,
        invocation,
        image,
        call,
        ctx,
      ),
  });
  harness = await openPlatformAgentSession(
    async () => new MemoryStorage(),
    image,
    {
      ...owner,
      generation: 1,
      executionDigest: image.executionDigest,
      effectiveVersion: "state:one",
    },
    call,
    {
      models,
      registry,
      modelRequests: port,
      prepareCommit: async (tx, staged) => {
        const taskId = receipt?.invocations[0]!.nativeInvocation?.task.taskId;
        if (taskId !== undefined) {
          const notice = await nativeRunWaitPresentation(
            tx,
            staged,
            taskId as import("@panticonic/pi-durable").TaskId,
          );
          notices.push(
            notice ? { reason: notice.reason, summary: notice.summary } : null,
          );
        }
      },
    },
    context,
  );
  sessions.push(harness);
  const conversation = await openNativeChannelConversation(
    harness,
    {
      channelId: "channel:helper",
      contextId: owner.contextId,
      channelRef: {
        source: "workers/channel",
        className: "ChannelDO",
        objectKey: "channel:helper",
      },
    },
    {},
    context,
  );
  let stopWatching = () => {};
  let credentialWaitResolve!: () => void;
  const credentialWaiting = new Promise<void>((resolve) => {
    credentialWaitResolve = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    stopWatching = harness.subscribeCommits((publication) => {
      for (const change of publication.changes) {
        if (
          change.type !== "task" ||
          change.value.kind !== "vibestudio.model-helper" ||
          change.value.state.status !== "waiting"
        )
          continue;
        if (change.value.state.condition.kind === "receipt") resolve();
        if (change.value.state.condition.kind === "input")
          credentialWaitResolve();
      }
    });
  });
  const completion = completeNativeModelHelper(
    harness,
    conversation,
    faux.getModel(),
    {
      systemPrompt: "Write the draft",
      messages: [{ role: "user", content: "Email", timestamp: 1 }],
    },
    {},
    context,
  );
  const settle = () => {
    receipt = {
      ...receipt,
      state: "decided",
      resolution: credentialSetup
        ? { state: "decided" }
        : {
            decision: "allowed",
            protectedExecutionDigest: image.executionDigest,
          },
      resolutionDigest: "d".repeat(64),
      settledAt: 2,
    };
  };
  return {
    harness,
    call,
    waiting,
    credentialWaiting,
    notices,
    stopWatching: () => stopWatching(),
    completion,
    settle,
    acknowledged,
    receipt: () => receipt,
    connect: async () => {
      credentialConnected = true;
      await notifyModelCredentialChange(
        harness,
        owner,
        conversation.id,
        faux.getModel().provider,
        context,
      );
    },
  };
}

describe("native helper authority receipts", () => {
  it("continues the same request from workspace review into provider setup and completion", async () => {
    const helper = await nativeHelperApproval(true, true);
    try {
      await helper.waiting;
      expect(helper.notices).toContainEqual({
        reason: "input_required",
        summary:
          "Finish reviewing Welcome — here's what's in your workspace to continue.",
      });
      const taskBefore =
        helper.receipt().invocations[0]!.nativeInvocation!.task.taskId;
      helper.settle();
      await consumeAuthorityReceipt(
        helper.harness,
        "approval:helper",
        image,
        helper.call,
        context,
      );
      await helper.credentialWaiting;
      expect(
        helper.notices.some(
          (notice) => notice?.reason === "model_credential_required",
        ),
      ).toBe(true);
      let completed = false;
      void helper.completion.then(() => {
        completed = true;
      });
      await helper.harness.runPass(context);
      expect(completed).toBe(false);
      expect(
        helper.receipt().invocations[0]!.nativeInvocation!.task.taskId,
      ).toBe(taskBefore);
      await helper.connect();
      expect((await helper.completion).content).toEqual([
        { type: "text", text: "approved helper answer" },
      ]);
    } finally {
      helper.stopWatching();
    }
  });

  it("parks a real helper EACQUIRE and resumes its exact task after consuming approval", async () => {
    const helper = await nativeHelperApproval(true);
    try {
      await Promise.race([
        helper.waiting,
        helper.completion.then(() => {
          throw new Error("Helper completed before authority approval");
        }),
      ]);
      expect(helper.acknowledged).toEqual([]);
      helper.settle();
      expect(
        await consumeAuthorityReceipt(
          helper.harness,
          "approval:helper",
          image,
          helper.call,
          context,
        ),
      ).toEqual({ accepted: true });
      expect((await helper.completion).content).toEqual([
        { type: "text", text: "approved helper answer" },
      ]);
      expect(
        helper.receipt().invocations[0]!.nativeInvocation?.operation.kind,
      ).toBe("model");
    } finally {
      helper.stopWatching();
    }
  });

  it("rejects terminal model receipts whose request was never admitted by the native port", async () => {
    const helper = await nativeHelperApproval(false);
    try {
      await helper.completion;
      helper.settle();
      const invocation = helper.receipt().invocations[0]!;
      const identity = invocation.nativeInvocation!;
      if (identity.operation.kind !== "model")
        throw new Error("Expected model receipt");
      const forged = {
        ...identity,
        operation: { ...identity.operation, modelId: "never-admitted-model" },
      };
      invocation.nativeInvocation = forged;
      if (invocation.causalParent?.kind !== "trajectory-invocation")
        throw new Error("Expected native causal parent");
      invocation.causalParent.invocationId = nativeInvocationId(forged);
      invocation.causalParent.nativeInvocation = forged;
      await expect(
        reconcileAuthorityReceipts(helper.harness, image, helper.call, context),
      ).rejects.toThrow("no original admitted native model request");
      expect(helper.acknowledged).toEqual([]);
    } finally {
      helper.stopWatching();
    }
  });

  it("reconciles unbound terminal helper receipt debt through its admitted model source", async () => {
    const helper = await nativeHelperApproval(false);
    try {
      await helper.completion;
      helper.settle();
      await reconcileAuthorityReceipts(
        helper.harness,
        image,
        helper.call,
        context,
      );
      expect(helper.acknowledged).toEqual([
        [
          {
            acquisitionId: "approval:helper",
            resolutionDigest: "d".repeat(64),
          },
        ],
      ]);
    } finally {
      helper.stopWatching();
    }
  });
});

describe("native authority receipt image continuity", () => {
  it("publishes approval as an actionable waiting notice and clears it on resume", async () => {
    const parked = await parkedApproval();
    expect(parked.notices).toContainEqual({
      reason: "input_required",
      summary: "Your approval is needed to Original model request.",
    });
    parked.settle();
    await consumeAuthorityReceipt(
      parked.harness,
      "approval:one",
      image,
      parked.call,
      context,
    );
    await parked.harness.runPass(context);
    expect(parked.notices.at(-1)).toBeNull();
  });

  it("keeps pending approval intact and consumes its original outcome after executable upgrade", async () => {
    const parked = await parkedApproval();
    const upgraded = { ...image, executionDigest: "e".repeat(64) };
    expect(
      await consumeAuthorityReceipt(
        parked.harness,
        "approval:one",
        upgraded,
        parked.call,
        context,
      ),
    ).toEqual({ accepted: false });
    expect(parked.acknowledged).toEqual([]);
    parked.settle();
    expect(
      await consumeAuthorityReceipt(
        parked.harness,
        "approval:one",
        upgraded,
        parked.call,
        context,
      ),
    ).toEqual({ accepted: true });
    expect(parked.receipt().invocations[0].code?.executionDigest).toBe(
      image.executionDigest,
    );
    expect(parked.acknowledged).toEqual([
      [{ acquisitionId: "approval:one", resolutionDigest: "d".repeat(64) }],
    ]);
  });

  it("retains owner coordinates and exact protected invocation across upgrade", async () => {
    const parked = await parkedApproval();
    parked.settle();
    await expect(
      consumeAuthorityReceipt(
        parked.harness,
        "approval:one",
        { ...image, objectKey: "other", executionDigest: "e".repeat(64) },
        parked.call,
        context,
      ),
    ).rejects.toThrow("different execution owner");
    const original = parked.receipt();
    original.invocations[0].code!.executionDigest = "f".repeat(64);
    await expect(
      consumeAuthorityReceipt(
        parked.harness,
        "approval:one",
        { ...image, executionDigest: "e".repeat(64) },
        parked.call,
        context,
      ),
    ).rejects.toThrow("conflicts with its retained admission");
    expect(parked.acknowledged).toEqual([]);
  });
});
