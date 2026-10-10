import { afterEach, describe, expect, it } from "vitest";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  MemoryStorage,
  type Harness,
} from "@panticonic/pi-durable";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import type { AuthorityAcquisitionReceipt } from "@vibestudio/service-schemas/authority";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { openBoundAgentSession } from "./native-agent-session.js";
import {
  bindAuthorityAcquisition,
  consumeAuthorityReceipt,
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
    owner,
    {
      models,
      registry: createRegistry(),
      publishWake: async () => {},
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

describe("native authority receipt image continuity", () => {
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
