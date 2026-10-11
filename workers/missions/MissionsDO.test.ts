import { describe, expect, it, vi } from "vitest";
import { DURABLE_OBJECT_FRAMEWORK_RPC_METHODS } from "@vibestudio/durable";
import { createTestDO } from "@vibestudio/durable/test-utils";
import { wireCallerFor } from "@vibestudio/rpc/internal";
import { rpcExposedMethodNames } from "@vibestudio/rpc";
import { executionSessionNonceFor } from "@vibestudio/rpc/internal";
import { missionsMethods } from "@vibestudio/service-schemas/missions";
import type {
  MissionCharter,
  MissionAuthorityPlanReference,
  MissionRunRecord,
} from "@vibestudio/automation/mission";
import { missionPrincipal } from "@vibestudio/automation/mission";
import { MissionsDO } from "./MissionsDO.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import { RuntimeEntityHandleSchema } from "@vibestudio/service-schemas/runtime";
import {
  canonicalEntityId,
  runtimeEntitySource,
  runtimeEntityBuildRef,
  type RuntimeEntityCreateSpec,
} from "@vibestudio/shared/runtime/entitySpec";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const GAD_TARGET = "do:workers/workspace-source:GadWorkspaceDO:workspace";
const RESTART = {
  epoch: "restart",
  previousGeneration: 1,
  currentGeneration: 2,
  reason: "planned" as const,
};

class TestMissionsDO extends MissionsDO {
  wireCallerForTest() {
    return wireCallerFor(this.rpc);
  }
}

class ObservationMissionsDO extends TestMissionsDO {
  observationController = new AbortController();
  observationAdmitted: (() => void) | null = null;
  override async observeChanges(input: {
    afterVersion?: string;
  }): Promise<{ version: string }> {
    const observation = super.observeChanges(input);
    this.observationAdmitted?.();
    return observation;
  }
  protected override get rpcAbortSignal(): AbortSignal {
    return this.observationController.signal;
  }
}

class IdempotentLaunchMissionsDO extends TestMissionsDO {
  protected override get rpcIdempotencyKey(): string | null {
    return "agent-launch-request";
  }
}

class IdempotentCommandMissionsDO extends TestMissionsDO {
  protected override get rpcIdempotencyKey(): string | null {
    return "stable-command";
  }
}

class IdentityMissionsDO extends TestMissionsDO {
  identityForTest() {
    return {
      source: this.env["WORKER_SOURCE"],
      className: this.env["WORKER_CLASS_NAME"],
      objectKey: this.env["__objectKey"],
    };
  }
}

class ExecutionOwnershipMissionsDO extends TestMissionsDO {
  commandAfterExecution: ReturnType<
    ExecutionOwnershipMissionsDO["invocationForTest"]
  > | null = null;

  override async runNow(missionId: string): Promise<MissionRunRecord> {
    const result = await super.runNow(missionId);
    this.commandAfterExecution = this.invocationForTest();
    return result;
  }

  invocationForTest() {
    return {
      caller: this.caller,
      authorization: this.authorization,
    };
  }
}

function agentCharter(summary = "Prepare a daily summary"): MissionCharter {
  return {
    summary,
    execution: {
      kind: "agent",
      image: {
        source: "workers/summary",
        ref: `state:${HASH_B}`,
        effectiveVersion: HASH_A,
        className: "SummaryAgent",
        objectKey: "daily",
      },
      action: { kind: "prompt", text: "Prepare a daily summary" },
      conversation: { mode: "fresh" },
      operations: [],
    },
    trigger: { kind: "manual" },
  };
}

function continuingAgentCharter(): MissionCharter {
  const charter = agentCharter("Continue the current conversation");
  if (charter.execution.kind !== "agent") throw new Error("Expected agent");
  charter.execution.conversation = {
    mode: "continue",
    channelId: "conversation:daily",
    contextId: "context:daily",
    executorId: "do:workers/summary:SummaryAgent:daily",
  };
  return charter;
}

function methodCharter(): MissionCharter {
  return {
    summary: "Check whether the rollout is complete",
    execution: {
      kind: "method",
      image: {
        source: "workers/rollout",
        ref: `state:${HASH_C}`,
        effectiveVersion: HASH_B,
        className: "RolloutWorker",
        objectKey: "primary",
      },
      method: "check",
      args: [{ deployment: "production" }],
      operations: [],
    },
    trigger: { kind: "manual" },
  };
}

function policy(digest = HASH_C): MissionAuthorityPlanReference {
  return {
    schemaVersion: 2,
    digest,
    artifactRef: `authority-plan:${digest}`,
    compilerVersion: "test-compiler",
    catalogDigest: HASH_A,
  };
}

function resolvedGadService() {
  return durableObjectServiceFixture(GAD_TARGET, {
    source: "workers/workspace-source",
    name: "workspace-source",
    className: "GadWorkspaceDO",
    objectKey: "workspace",
    protocols: ["vibestudio.gad.workspace.v1"],
  });
}

function resolvedChannelService(channelId: string) {
  return durableObjectServiceFixture(
    `do:workers/pubsub-channel:PubSubChannel:${channelId}`,
    {
      source: "workers/pubsub-channel",
      name: "pubsub-channel",
      className: "PubSubChannel",
      objectKey: channelId,
      protocols: ["vibestudio.channel.v1"],
    },
  );
}

function runtimeEntityReply(args: unknown[], contextId?: string) {
  const spec = args[0] as RuntimeEntityCreateSpec;
  const source = runtimeEntitySource(spec);
  const id = canonicalEntityId({
    kind: spec.kind,
    source,
    ...(spec.kind === "do" ? { className: spec.className } : {}),
    key: spec.key ?? "test-entity",
  });
  return RuntimeEntityHandleSchema.parse({
    id,
    kind: spec.kind,
    source: {
      repoPath: source,
      effectiveVersion:
        runtimeEntityBuildRef(spec)?.replace(/^state:/u, "") ?? HASH_A,
    },
    contextId: contextId ?? spec.contextId ?? "context:test-runtime-entity",
    targetId: id,
    ...(spec.kind === "do" && spec.agentInitialization
      ? {
          agentInitialization: {
            ok: true,
            participantId: `agent:${spec.key ?? "test-runtime-entity"}`,
          },
        }
      : {}),
  });
}

const alice = {
  callerId: "panel:alice",
  callerKind: "panel" as const,
  userId: "alice",
};
const bob = {
  callerId: "panel:bob",
  callerKind: "panel" as const,
  userId: "bob",
};

async function createMissions<T extends typeof TestMissionsDO>(
  ctor: T = TestMissionsDO as T,
  db?: Awaited<ReturnType<typeof createTestDO>>["db"],
) {
  const result = await createTestDO(
    ctor,
    {
      WORKER_SOURCE: "workers/missions",
      WORKER_CLASS_NAME: "MissionsDO",
      __objectKey: "workspace-missions",
    },
    { db },
  );
  let authorityPlanDigest = HASH_C;
  const calls: Array<{
    target: string;
    method: string;
    args: unknown[];
    options?: unknown;
  }> = [];
  const rpcCall = vi.fn(
    async (
      target: string,
      method: string,
      args: unknown[] = [],
      options?: unknown,
    ): Promise<unknown> => {
      calls.push({ target, method, args, options });
      if (target === "main" && method === "authority.verifyAuthorityPlan")
        return policy(authorityPlanDigest);
      if (target === "main" && method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: ["grant:mission"], denialIds: [] };
      if (target === "main" && method === "authority.retireTarget")
        return { cancelledRequestCount: 0, revokedGrantCount: 1 };
      if (target === "main" && method.startsWith("workspace-state.alarm"))
        return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    },
  );
  const lifecycleCalls: Array<{ method: string; args: unknown[] }> = [];
  vi.spyOn(result.instance.wireCallerForTest(), "call").mockImplementation(
    (target, method, args = [], options) => {
      if (
        target === "main" &&
        method.startsWith("workspace-state.lifecycleLease")
      ) {
        lifecycleCalls.push({ method, args });
        return Promise.resolve();
      }
      return rpcCall(target, method, args, options);
    },
  );
  return {
    ...result,
    calls,
    rpcCall,
    lifecycleCalls,
    setPolicyDigest(value: string) {
      authorityPlanDigest = value;
    },
  };
}

describe("MissionsDO", () => {
  it("propagates a failed observation read without failing the owner's committed mutation", async () => {
    const harness = await createMissions(ObservationMissionsDO);
    const mission = await harness.callAs(alice, "launch", {
      name: "Observed task",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    const initial = await harness.callAs(alice, "observeChanges", {});
    const admitted = new Promise<void>((resolve) => {
      (harness.instance as ObservationMissionsDO).observationAdmitted = resolve;
    });
    const pending = harness.callAs(alice, "observeChanges", {
      afterVersion: initial.version,
    });
    await admitted;
    const exec = harness.sql.exec.bind(harness.sql);
    const read = vi
      .spyOn(harness.sql, "exec")
      .mockImplementation((query, ...bindings) => {
        if (
          query.startsWith(
            "SELECT * FROM missions WHERE seeded=1 OR owner_user_id=",
          )
        )
          throw new Error("Observation read failed");
        return exec(query, ...bindings);
      });
    const rejected = expect(pending).rejects.toThrow("Observation read failed");
    await expect(
      harness.callAs(alice, "pause", mission.missionId),
    ).resolves.toMatchObject({ state: "paused" });
    await rejected;
    read.mockRestore();
    expect(await harness.callAs(alice, "get", mission.missionId)).toMatchObject(
      { state: "paused" },
    );
  });

  it("releases an observation when reading its initial version fails", async () => {
    const harness = await createMissions(ObservationMissionsDO);
    const signal = (harness.instance as ObservationMissionsDO)
      .observationController.signal;
    const removeListener = vi.spyOn(signal, "removeEventListener");
    const failure = new Error("Automation ledger read failed");
    const exec = harness.sql.exec.bind(harness.sql);
    const read = vi
      .spyOn(harness.sql, "exec")
      .mockImplementation((query, ...bindings) => {
        if (
          query.startsWith(
            "SELECT * FROM missions WHERE seeded=1 OR owner_user_id=",
          )
        )
          throw failure;
        return exec(query, ...bindings);
      });
    await expect(harness.callAs(alice, "observeChanges", {})).rejects.toThrow(
      failure.message,
    );
    read.mockRestore();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(await harness.callAs(alice, "observeChanges", {})).toMatchObject({
      version: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("observes only visible owner changes, retains invalidations before the next wait, and joins cancellation", async () => {
    const harness = await createMissions(ObservationMissionsDO);
    const initial = await harness.callAs(alice, "observeChanges", {});
    expect(initial).toMatchObject({
      version: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const admitted = new Promise<void>((resolve) => {
      (harness.instance as ObservationMissionsDO).observationAdmitted = resolve;
    });
    let changed = false;
    const watching = harness
      .callAs(alice, "observeChanges", { afterVersion: initial.version })
      .then((value) => {
        changed = true;
        return value;
      });
    await admitted;
    expect(changed).toBe(false);
    await harness.callAs(bob, "launch", {
      name: "Bob's task",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    expect(
      harness.sql.exec("SELECT owner_user_id,seeded FROM missions").toArray(),
    ).toEqual([{ owner_user_id: "bob", seeded: 0 }]);
    expect(await harness.callAs(alice, "observeChanges", {})).toEqual(initial);
    expect(changed).toBe(false);
    const mission = await harness.callAs(alice, "launch", {
      name: "Alice's task",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    const observed = await watching;
    expect(observed.version).not.toBe(initial.version);
    expect(observed.version).toMatch(/^[0-9a-f]{64}$/);
    await harness.callAs(alice, "pause", mission.missionId);
    const paused = await harness.callAs(alice, "observeChanges", {
      afterVersion: observed.version,
    });
    expect(paused.version).not.toBe(observed.version);
    const pending = harness.callAs(alice, "observeChanges", {
      afterVersion: paused.version,
    });
    const rejected = expect(pending).rejects.toThrow("Observation closed");
    (harness.instance as ObservationMissionsDO).observationController.abort(
      new Error("Observation closed"),
    );
    await rejected;
    expect(await harness.callAs(alice, "get", mission.missionId)).toMatchObject(
      { state: "paused" },
    );
  });

  it("settles an unchanged observation when its lifecycle owner is released", async () => {
    const harness = await createMissions();
    const current = await harness.callAs(alice, "observeChanges", {});
    const observing = harness.callAs(alice, "observeChanges", {
      afterVersion: current.version,
    });
    const closed = expect(observing).rejects.toThrow("lifecycle release");
    await Promise.resolve();
    await harness.instance.releaseForLifecycle({
      epoch: "suspend",
      phase: "release",
      mode: "suspend",
      reason: "restart",
      deadlineMs: 0,
    });
    await closed;
  });

  it.each([
    "admitted",
    "context-preparing",
    "executor-preparing",
    "execution-admitting",
    "dispatching",
    "executing",
  ])(
    "reopens durable %s advancement with the same receiver dispatch identity",
    async (phase) => {
      const original = await createMissions(IdempotentCommandMissionsDO);
      const executions = new Set<string>();
      const dispatches: string[] = [];
      const receiver = async (
        target: string,
        method: string,
        _args: unknown[] = [],
        options?: unknown,
      ) => {
        if (method === "authority.verifyAuthorityPlan") return policy();
        if (method === "authority.acquireForTarget")
          return { requestIds: [], grantIds: [], denialIds: [] };
        if (method === "runAutomationTurn") {
          const key = (options as { idempotencyKey: string }).idempotencyKey;
          dispatches.push(key);
          executions.add(key);
          return undefined;
        }
        if (method === "describeAutomationRun")
          return {
            state: "terminal",
            outcome: "succeeded",
            finalMessage: "Original receipt",
          };
        if (
          method === "acknowledgeAutomationRun" ||
          method.startsWith("workspace-state.alarm")
        )
          return undefined;
        throw new Error(`Unexpected RPC ${target}.${method}`);
      };
      original.rpcCall.mockImplementation(receiver);
      const mission = await original.callAs(alice, "launch", {
        name: "Owned turn",
        authorityPlan: policy(),
        charter: continuingAgentCharter(),
      });
      const run = await original.callAs(alice, "runNow", mission.missionId);
      expect(original.lifecycleCalls[0]).toMatchObject({
        method: "workspace-state.lifecycleLeaseUpsert",
        args: [
          {
            source: "workers/missions",
            className: "MissionsDO",
            objectKey: "workspace-missions",
            detail: { owner: "mission-runs" },
          },
        ],
      });
      expect(
        await original.instance.releaseForLifecycle({
          epoch: "suspend",
          phase: "release",
          mode: "suspend",
          reason: "restart",
          deadlineMs: 0,
        }),
      ).toEqual({ status: "ready" });
      expect(
        original.lifecycleCalls.some(
          (call) => call.method === "workspace-state.lifecycleLeaseClear",
        ),
      ).toBe(false);
      // The receiver accepted the stable command before the host checkpoint.
      // Reopen the same store without the old activation's run-driver map.
      original.sql.exec(
        "UPDATE mission_runs SET phase=? WHERE run_id=?",
        phase,
        run.runId,
      );
      const reopened = await createMissions(
        IdempotentCommandMissionsDO,
        original.db,
      );
      reopened.rpcCall.mockImplementation(receiver);
      await reopened.instance.resumeAfterRestart(RESTART);
      expect([...executions]).toEqual([`${run.runId}:dispatch`]);
      expect(dispatches).toHaveLength(phase === "executing" ? 1 : 2);
      await reopened.callAs(
        { callerId: run.executorId!, callerKind: "do" },
        "finishRun",
        {
          runId: run.runId,
          outcome: "succeeded",
          finalMessage: "Original receipt",
        },
      );
      expect(await reopened.callAs(alice, "getRun", run.runId)).toMatchObject({
        phase: "terminal",
        outcome: "succeeded",
      });
      expect(await reopened.instance.alarm()).toBeNull();
    },
  );
  it("provisions per owner once and preserves edits, pause, and retirement", async () => {
    const { callAs, sql } = await createMissions();
    const input = {
      authorityPlan: policy(),
      name: "Updates",
      charter: continuingAgentCharter(),
    };
    const first = await callAs(alice, "provisionDefault", "updates", input);
    await callAs(alice, "edit", first.missionId, { name: "My updates" });
    await callAs(alice, "pause", first.missionId);
    const changedDefault = { ...input, name: "New template default" };
    const paused = await callAs(
      alice,
      "provisionDefault",
      "updates",
      changedDefault,
    );
    expect(paused).toMatchObject({
      missionId: first.missionId,
      name: "My updates",
      state: "paused",
    });
    const other = await callAs(bob, "provisionDefault", "updates", input);
    expect(other.missionId).not.toBe(first.missionId);
    await callAs(alice, "retire", first.missionId);
    expect(
      await callAs(alice, "provisionDefault", "updates", input),
    ).toMatchObject({ state: "retired", missionId: first.missionId });
    expect(sql.exec("SELECT COUNT(*) AS count FROM missions").one()).toEqual({
      count: 2,
    });
  });

  it("adopts an existing equivalent watch without resetting its schedule or paused state", async () => {
    const { callAs, sql } = await createMissions();
    const charter = continuingAgentCharter();
    if (charter.execution.kind !== "agent") throw new Error("Expected agent");
    charter.execution.action = { kind: "watch", code: "return signal();" };
    charter.trigger = { kind: "schedule", everyMs: 3600000 };
    const manual = await callAs(alice, "launch", {
      name: "My watcher",
      authorityPlan: policy(),
      charter,
    });
    await callAs(alice, "pause", manual.missionId);
    const result = await callAs(alice, "provisionDefault", "updates", {
      name: "Default watcher",
      authorityPlan: policy(),
      charter: {
        ...charter,
        trigger: { kind: "schedule", everyMs: 21600000 },
      },
    });
    expect(result).toMatchObject({
      missionId: manual.missionId,
      state: "paused",
      charter: { trigger: { everyMs: 3600000 } },
    });
    expect(await callAs(alice, "getDefault", "updates")).toMatchObject({
      missionId: manual.missionId,
    });
    expect(await callAs(bob, "getDefault", "updates")).toBeNull();
    expect(sql.exec("SELECT COUNT(*) AS count FROM missions").one()).toEqual({
      count: 1,
    });
  });

  it("admits a paused default atomically and preserves its state on a lost-response retry", async () => {
    const harness = await createMissions();
    const input = {
      name: "Vacation briefing",
      authorityPlan: policy(),
      charter: continuingAgentCharter(),
      state: "paused" as const,
    };
    input.charter.trigger = { kind: "schedule", everyMs: 600_000 };
    const first = await harness.callAs(
      alice,
      "provisionDefault",
      "vacation",
      input,
    );
    expect(first).toMatchObject({ state: "paused", runCount: 0 });
    expect(first.nextRunAt).toBeUndefined();
    expect(await harness.callAs(alice, "pause", first.missionId)).toEqual(
      first,
    );
    expect(
      harness.sql.exec("SELECT COUNT(*) AS count FROM mission_runs").one(),
    ).toEqual({ count: 0 });
    const retry = await harness.callAs(alice, "provisionDefault", "vacation", {
      ...input,
      state: "active",
    });
    expect(retry).toMatchObject({
      missionId: first.missionId,
      state: "paused",
    });
    const resumed = await harness.callAs(alice, "resume", first.missionId);
    expect(resumed.state).toBe("active");
    expect(await harness.callAs(alice, "resume", first.missionId)).toEqual(
      resumed,
    );
  });

  it("keeps distinct declared defaults distinct even when their watch actions match", async () => {
    const { callAs } = await createMissions();
    const charter = continuingAgentCharter();
    if (charter.execution.kind !== "agent") throw new Error("Expected agent");
    charter.execution.action = { kind: "watch", code: "return signal();" };
    const input = { authorityPlan: policy(), name: "Watcher", charter };
    const first = await callAs(alice, "provisionDefault", "first", input);
    const second = await callAs(alice, "provisionDefault", "second", input);
    expect(second.missionId).not.toBe(first.missionId);
  });

  it("runs under its installed Base provider identity", async () => {
    const { instance } = await createTestDO(IdentityMissionsDO, {
      WORKER_SOURCE: "workers/missions",
      WORKER_CLASS_NAME: "MissionsDO",
      __objectKey: "workspace-missions",
    });
    expect(instance.identityForTest()).toEqual({
      source: "workers/missions",
      className: "MissionsDO",
      objectKey: "workspace-missions",
    });
  });

  it("exposes exactly the typed builtin contract", async () => {
    const { instance } = await createMissions();
    const productMethods = [...rpcExposedMethodNames(instance)].filter(
      (method) => !DURABLE_OBJECT_FRAMEWORK_RPC_METHODS.has(method),
    );
    expect(productMethods.sort()).toEqual(Object.keys(missionsMethods).sort());
  });

  it("launches immediately with a host-compiled authority plan and user-bound durable authority", async () => {
    const { callAs, calls } = await createMissions();
    const created = await callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    expect(created).toMatchObject({
      schemaVersion: 3,
      name: "Daily summary",
      state: "active",
      revision: 1,
      owner: { userId: "alice" },
      authorityPlan: policy(),
      authority: { requestIds: [], grantIds: ["grant:mission"], denialIds: [] },
    });
    expect(created.revisionDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(calls.map(({ method }) => method)).toEqual([
      "authority.verifyAuthorityPlan",
      "authority.acquireForTarget",
    ]);
    expect(calls[1]?.args).toEqual([
      {
        targetSubject: missionPrincipal(
          created.missionId,
          created.revisionDigest,
        ),
        authorityPlanDigest: HASH_C,
      },
    ]);
    await expect(callAs(bob, "get", created.missionId)).rejects.toThrow(
      /Unknown automation/,
    );
  });

  it("rejects a missing or noncanonical plan before installing a definition", async () => {
    const harness = await createMissions();
    await expect(
      harness.callAs(alice, "launch", {
        name: "Missing",
        charter: agentCharter(),
      }),
    ).rejects.toThrow();
    await expect(
      harness.callAs(alice, "launch", {
        name: "Forged",
        charter: agentCharter(),
        authorityPlan: { ...policy(), catalogDigest: HASH_B },
      }),
    ).rejects.toThrow(/canonical artifact/);
    expect(
      harness.sql.exec("SELECT COUNT(*) AS count FROM missions").one(),
    ).toEqual({ count: 0 });
    expect(
      harness.calls.some(
        ({ method }) => method === "authority.acquireForTarget",
      ),
    ).toBe(false);
  });

  it("customizes a seeded definition only with the UI author's newly compiled plan", async () => {
    const harness = await createMissions();
    const original = await harness.callAs(alice, "launch", {
      name: "Seeded",
      charter: continuingAgentCharter(),
      authorityPlan: policy(),
    });
    harness.sql.exec(
      "UPDATE missions SET seeded=1 WHERE mission_id=?",
      original.missionId,
    );
    await expect(
      harness.callAs(alice, "edit", original.missionId, { name: "My cadence" }),
    ).rejects.toThrow(/newly compiled plan/);
    harness.setPolicyDigest(HASH_B);
    const customized = await harness.callAs(alice, "edit", original.missionId, {
      name: "My cadence",
      charter: {
        ...original.charter,
        trigger: { kind: "schedule", everyMs: 7200000 },
      },
      authorityPlan: policy(HASH_B),
    });
    expect(customized.missionId).not.toBe(original.missionId);
    expect(customized.authorityPlan).toEqual(policy(HASH_B));
    expect(customized.name).toBe("My cadence");
    expect(
      harness.calls.filter(
        ({ method }) => method === "authority.verifyAuthorityPlan",
      ),
    ).toHaveLength(2);
    expect(
      harness.calls.some(
        ({ method }) => method === "authority.compileAuthorityPlan",
      ),
    ).toBe(false);
  });

  it("reuses an installed plan for owned name and cadence edits without repeating preparation", async () => {
    const harness = await createMissions();
    const original = await harness.callAs(alice, "launch", {
      name: "Schedule",
      charter: continuingAgentCharter(),
      authorityPlan: policy(),
    });
    const edited = await harness.callAs(alice, "edit", original.missionId, {
      name: "Renamed",
      charter: {
        ...original.charter,
        trigger: { kind: "schedule", everyMs: 7200000 },
      },
    });
    expect(edited.authorityPlan).toEqual(original.authorityPlan);
    expect(edited.revision).toBe(2);
    expect(
      harness.calls.filter(
        ({ method }) => method === "authority.verifyAuthorityPlan",
      ),
    ).toHaveLength(1);
  });

  it("deduplicates launch transport retries without duplicate definitions", async () => {
    const { callAs, sql } = await createMissions(IdempotentLaunchMissionsDO);
    const input = {
      authorityPlan: policy(),
      name: "Daily summary",
      charter: agentCharter(),
    };
    const first = await callAs(alice, "launch", input);
    const retry = await callAs(alice, "launch", input);
    expect(retry.missionId).toBe(first.missionId);
    expect(sql.exec("SELECT COUNT(*) AS count FROM missions").one()).toEqual({
      count: 1,
    });
    expect(
      sql.exec("SELECT COUNT(*) AS count FROM mission_launches").one(),
    ).toEqual({ count: 1 });
  });

  it("pause changes admission eligibility without discarding standing grants", async () => {
    const { callAs, calls } = await createMissions();
    const launched = await callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    const acquiredBeforePause = calls.filter(
      ({ method }) => method === "authority.acquireForTarget",
    );
    const paused = await callAs(alice, "pause", launched.missionId);
    const resumed = await callAs(alice, "resume", launched.missionId);
    expect(paused.state).toBe("paused");
    expect(paused.authority).toEqual(launched.authority);
    expect(resumed.state).toBe("active");
    expect(resumed.authority).toEqual(launched.authority);
    expect(
      calls.filter(({ method }) => method === "authority.acquireForTarget"),
    ).toEqual(acquiredBeforePause);
    expect(
      calls.some(({ method }) => /revoke|retire|suspend/u.test(method)),
    ).toBe(false);
  });

  it("keeps open lifecycle controls scoped to the automation owner", async () => {
    const { callAs } = await createMissions();
    const launched = await callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter: agentCharter(),
    });

    await expect(callAs(bob, "pause", launched.missionId)).rejects.toThrow(
      /Unknown automation/,
    );
    expect(await callAs(alice, "get", launched.missionId)).toMatchObject({
      state: "active",
    });
  });

  it("edits by creating a new immutable revision subject and policy", async () => {
    const harness = await createMissions();
    const launched = await harness.callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    harness.setPolicyDigest(HASH_B);
    const edited = await harness.callAs(alice, "edit", launched.missionId, {
      name: "Focused summary",
      authorityPlan: policy(HASH_B),
      charter: agentCharter("Prepare a focused summary"),
    });
    expect(edited).toMatchObject({
      missionId: launched.missionId,
      revision: 2,
      state: "active",
    });
    expect(edited.revisionDigest).not.toBe(launched.revisionDigest);
    expect(edited.authorityPlan.digest).toBe(HASH_B);
    expect(
      harness.calls
        .filter(({ method }) => method === "authority.acquireForTarget")
        .at(-1)?.args,
    ).toEqual([
      {
        targetSubject: missionPrincipal(
          edited.missionId,
          edited.revisionDigest,
        ),
        authorityPlanDigest: HASH_B,
      },
    ]);
    expect(
      harness.calls.find(({ method }) => method === "authority.retireTarget")
        ?.args,
    ).toEqual([
      {
        targetSubject: missionPrincipal(
          launched.missionId,
          launched.revisionDigest,
        ),
      },
    ]);
  });

  it("deduplicates edit retries to the exact committed revision", async () => {
    const harness = await createMissions(IdempotentCommandMissionsDO);
    const launched = await harness.callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    harness.setPolicyDigest(HASH_B);
    const input = {
      name: "Focused summary",
      authorityPlan: policy(HASH_B),
      charter: agentCharter("Prepare a focused summary"),
    };
    const first = await harness.callAs(
      alice,
      "edit",
      launched.missionId,
      input,
    );
    const replay = await harness.callAs(
      alice,
      "edit",
      launched.missionId,
      input,
    );

    expect(replay).toEqual(first);
    expect(replay.revision).toBe(2);
    expect(
      harness.sql.exec("SELECT COUNT(*) AS count FROM mission_revisions").one(),
    ).toEqual({
      count: 1,
    });
    expect(
      harness.calls.filter(
        ({ method }) => method === "authority.verifyAuthorityPlan",
      ),
    ).toHaveLength(2);
  });

  it("binds method dispatch to the admitted execution nonce and closes admission", async () => {
    const harness = await createMissions();
    harness.rpcCall.mockImplementation(
      async (target, method, args = [], options) => {
        harness.calls.push({ target, method, args, options });
        if (target === "main" && method === "authority.verifyAuthorityPlan")
          return policy();
        if (target === "main" && method === "authority.acquireForTarget")
          return { requestIds: [], grantIds: ["grant:mission"], denialIds: [] };
        if (target === "main" && method === "runtime.createEntity")
          return runtimeEntityReply(args);
        if (target === "main" && method === "authority.admitExecution")
          return { authoritySessionId: "admission:one", nonce: "nonce:one" };
        if (target === "main" && method === "authority.finishExecution")
          return undefined;
        if (
          target === "do:workers/rollout:RolloutWorker:primary" &&
          method === "check"
        )
          return { ready: true };
        if (target === "main" && method.startsWith("workspace-state.alarm"))
          return undefined;
        throw new Error(`Unexpected RPC ${target}.${method}`);
      },
    );
    const launched = await harness.callAs(alice, "launch", {
      name: "Rollout check",
      authorityPlan: policy(),
      charter: methodCharter(),
    });
    const run = await harness.callAs(alice, "runNow", launched.missionId);
    expect(run).toMatchObject({ phase: "terminal", outcome: "succeeded" });
    const dispatch = harness.calls.find(
      ({ target, method }) =>
        target === "do:workers/rollout:RolloutWorker:primary" &&
        method === "check",
    );
    expect(dispatch?.options).toMatchObject({
      idempotencyKey: `${run.runId}:dispatch`,
    });
    expect(executionSessionNonceFor(dispatch?.options as never)).toBe(
      "nonce:one",
    );
    expect(
      harness.calls.some(
        ({ method }) => method === "authority.finishExecution",
      ),
    ).toBe(true);
  });

  it("dispatches a continuing turn through the existing agent authority path", async () => {
    const harness = await createMissions();
    harness.rpcCall.mockImplementation(
      async (target, method, args = [], options) => {
        harness.calls.push({ target, method, args, options });
        if (target === "main" && method === "authority.verifyAuthorityPlan")
          return policy();
        if (
          target === "do:workers/summary:SummaryAgent:daily" &&
          method === "runAutomationTurn"
        )
          return undefined;
        if (target === "main" && method.startsWith("workspace-state.alarm"))
          return undefined;
        throw new Error(`Unexpected RPC ${target}.${method}`);
      },
    );
    const mission = await harness.callAs(alice, "launch", {
      name: "Conversation reminder",
      authorityPlan: policy(),
      charter: continuingAgentCharter(),
    });

    const run = await harness.callAs(alice, "runNow", mission.missionId);

    expect(run).toMatchObject({
      phase: "executing",
      contextId: "context:daily",
      channelId: "conversation:daily",
      executorId: "do:workers/summary:SummaryAgent:daily",
    });
    expect(
      harness.calls.filter(
        ({ method }) =>
          method === "runtime.createContext" ||
          method === "runtime.createEntity" ||
          method === "subscribeChannel",
      ),
    ).toEqual([]);
    const dispatch = harness.calls.find(
      ({ target, method }) =>
        target === "do:workers/summary:SummaryAgent:daily" &&
        method === "runAutomationTurn",
    );
    expect(dispatch?.args).toEqual([
      expect.objectContaining({
        channelId: "conversation:daily",
        prompt: "Prepare a daily summary",
      }),
    ]);
    expect(
      executionSessionNonceFor(dispatch?.options as never),
    ).toBeUndefined();
    expect(
      harness.calls.filter(
        ({ method }) =>
          method === "authority.acquireForTarget" ||
          method === "authority.admitExecution",
      ),
    ).toEqual([]);

    await harness.callAs(alice, "retire", mission.missionId);
    expect(
      harness.sql
        .exec(
          "SELECT phase,outcome FROM mission_runs WHERE run_id=?",
          run.runId,
        )
        .one(),
    ).toEqual({ phase: "terminal", outcome: "interrupted" });
    expect(
      harness.calls.some(({ method }) => method === "authority.retireTarget"),
    ).toBe(false);
  });

  it("dispatches an exact tool to the continuing agent without creating a separate executor or eval", async () => {
    const harness = await createMissions();
    harness.rpcCall.mockImplementation(
      async (target, method, args = [], options) => {
        harness.calls.push({ target, method, args, options });
        if (target === "main" && method === "authority.verifyAuthorityPlan")
          return policy();
        if (target === "main" && method.startsWith("workspace-state.alarm"))
          return undefined;
        if (
          target === "do:workers/summary:SummaryAgent:daily" &&
          method === "runAutomationTool"
        )
          return undefined;
        throw new Error(`Unexpected RPC ${target}.${method}`);
      },
    );
    const charter = continuingAgentCharter();
    if (charter.execution.kind !== "agent") throw new Error("Expected agent");
    charter.execution.action = {
      kind: "tool",
      tool: "refreshNow",
      args: { briefing: false },
    };
    const mission = await harness.callAs(alice, "launch", {
      name: "Refresh News",
      authorityPlan: policy(),
      charter,
    });
    const run = await harness.callAs(alice, "runNow", mission.missionId);
    expect(run).toMatchObject({
      phase: "executing",
      executorId: "do:workers/summary:SummaryAgent:daily",
    });
    expect(
      harness.calls.filter(({ method }) => method === "runAutomationTool"),
    ).toEqual([
      expect.objectContaining({
        target: "do:workers/summary:SummaryAgent:daily",
        args: [
          expect.objectContaining({
            channelId: "conversation:daily",
            tool: "refreshNow",
            args: { briefing: false },
          }),
        ],
      }),
    ]);
    expect(
      harness.calls.some(({ method }) =>
        [
          "runtime.createContext",
          "runtime.createEntity",
          "runAutomationEval",
          "runAutomationTurn",
        ].includes(method),
      ),
    ).toBe(false);
  });

  it.each(["delivered", "inbox-failed", "push-failed"] as const)(
    "settles notification delivery from the inbox record: %s",
    async (delivery) => {
      const harness = await createMissions();
      const originalCall = harness.rpcCall.getMockImplementation()!;
      const notifications: Array<Record<string, unknown>> = [];
      const pushes: unknown[][] = [];
      harness.rpcCall.mockImplementation(
        async (target, method, args = [], options) => {
          harness.calls.push({ target, method, args, options });
          if (target === "main" && method === "workers.resolveService")
            return resolvedGadService();
          if (target === GAD_TARGET && method === "putUserNotification") {
            const notification = args[0] as Record<string, unknown>;
            if (
              delivery === "inbox-failed" &&
              notification["kind"] === "automation.notify"
            )
              throw new Error("Inbox write failed");
            notifications.push(notification);
            return notification;
          }
          if (target === "main" && method === "notification.pushUserInbox") {
            pushes.push(args);
            if (delivery === "push-failed")
              throw new Error("Device unreachable");
            return undefined;
          }
          return originalCall(target, method, args, options);
        },
      );
      const charter = continuingAgentCharter();
      if (charter.execution.kind !== "agent") throw new Error("Expected agent");
      charter.execution.action = {
        kind: "notify",
        text: "Review the rollout\nDetails",
        title: "Reminder",
        alert: "interrupt",
      };
      const mission = await harness.callAs(alice, "launch", {
        name: "Rollout reminder",
        authorityPlan: policy(),
        charter,
      });
      const run = await harness.callAs(alice, "runNow", mission.missionId);
      expect(run.phase).toBe("terminal");
      expect(run.outcome).toBe(
        delivery === "inbox-failed" ? "failed" : "succeeded",
      );
      if (delivery === "inbox-failed") {
        expect(run.failure?.message).toContain("Inbox write failed");
        expect(pushes).toEqual([]);
      } else {
        expect(notifications).toContainEqual(
          expect.objectContaining({
            id: `automation.notify:${run.runId}`,
            userId: "alice",
            kind: "automation.notify",
            title: "Reminder",
            message: "Review the rollout\nDetails",
            data: {
              missionId: mission.missionId,
              runId: run.runId,
              channelId: "conversation:daily",
            },
          }),
        );
        expect(pushes).toEqual([
          [
            "alice",
            expect.objectContaining({
              notificationId: `automation.notify:${run.runId}`,
              body: "Review the rollout",
              priority: "high",
              channelId: "conversation:daily",
            }),
          ],
        ]);
      }
      expect(
        harness.calls.some(({ method }) =>
          [
            "runtime.createContext",
            "runtime.createEntity",
            "runAutomationTurn",
            "runAutomationEval",
          ].includes(method),
        ),
      ).toBe(false);
    },
  );

  it("records an overlapping occurrence and raises one persistent run issue", async () => {
    const harness = await createMissions();
    const executorId = "do:workers/summary:SummaryAgent:daily";
    const gadTarget = GAD_TARGET;
    const notifications: Array<Record<string, unknown>> = [];
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      if (target === "main" && method === "authority.verifyAuthorityPlan")
        return policy();
      if (target === "main" && method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (target === "main" && method === "authority.admitExecution")
        return {
          authoritySessionId: "admission:continuing",
          nonce: "nonce:continuing",
        };
      if (target === executorId && method === "runAutomationTurn")
        return undefined;
      if (target === "main" && method === "workers.resolveService")
        return resolvedGadService();
      if (target === gadTarget && method === "putUserNotification") {
        notifications.push(args[0] as Record<string, unknown>);
        return args[0];
      }
      if (target === "main" && method.startsWith("workspace-state.alarm"))
        return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      name: "Conversation reminder",
      authorityPlan: policy(),
      charter: continuingAgentCharter(),
    });
    const active = await harness.callAs(alice, "runNow", mission.missionId);
    const blocked = await harness.callAs(alice, "runNow", mission.missionId);

    expect(active.phase).toBe("executing");
    expect(blocked).toMatchObject({
      phase: "terminal",
      outcome: "skipped",
      failure: {
        code: "ERUNACTIVE",
        retry: "automatic",
      },
    });
    expect(notifications).toEqual([
      expect.objectContaining({
        id: `automation.run.overrun:${active.runId}`,
        kind: "automation.run.issue",
        title: "Conversation reminder is delayed",
        data: {
          missionId: mission.missionId,
          runId: active.runId,
          blockedRunId: blocked.runId,
        },
      }),
    ]);
  });

  it("deduplicates a retried manual run by its durable command identity", async () => {
    const harness = await createMissions(IdempotentCommandMissionsDO);
    let dispatches = 0;
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      if (target === "main" && method === "authority.verifyAuthorityPlan")
        return policy();
      if (target === "main" && method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (target === "main" && method === "runtime.createEntity")
        return runtimeEntityReply(args);
      if (target === "main" && method === "authority.admitExecution")
        return { authoritySessionId: "admission:one", nonce: "nonce:one" };
      if (target === "main" && method === "authority.finishExecution")
        return undefined;
      if (
        target === "do:workers/rollout:RolloutWorker:primary" &&
        method === "check"
      ) {
        dispatches += 1;
        return { ready: true };
      }
      if (target === "main" && method.startsWith("workspace-state.alarm"))
        return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      name: "Rollout check",
      authorityPlan: policy(),
      charter: methodCharter(),
    });
    const first = await harness.callAs(alice, "runNow", mission.missionId);
    const replay = await harness.callAs(alice, "runNow", mission.missionId);

    expect(replay.runId).toBe(first.runId);
    expect(dispatches).toBe(1);
    expect(
      harness.sql.exec("SELECT COUNT(*) AS count FROM mission_runs").one(),
    ).toEqual({
      count: 1,
    });
  });

  it.each(["queued", "running"] as const)(
    "reconciles a %s turn from receiver-owned evidence",
    async (initialState) => {
      const harness = await createMissions(IdempotentCommandMissionsDO);
      const dispatchKeys: string[] = [];
      let admissions = 0;
      let executorStatus:
        | { state: "not-found" }
        | { state: "queued"; channelId: string }
        | {
            state: "running";
            channelId: string;
            nativeTaskId: number;
            waiting: boolean;
          }
        | {
            state: "terminal";
            outcome: "succeeded";
            finalMessage: string;
          } = {
        state: initialState,
        channelId: "do:workers/pubsub-channel:PubSubChannel:fresh",
        nativeTaskId: 12,
        waiting: true,
      };
      let acknowledged = false;
      harness.rpcCall.mockImplementation(
        async (target, method, args = [], options) => {
          if (target === "main" && method === "authority.verifyAuthorityPlan")
            return policy();
          if (target === "main" && method === "authority.acquireForTarget")
            return { requestIds: [], grantIds: [], denialIds: [] };
          if (target === "main" && method === "runtime.createContext")
            return { contextId: "ctx:fresh" };
          if (target === "main" && method === "runtime.createEntity")
            return runtimeEntityReply(args, "ctx:fresh");
          if (target === "main" && method === "workers.resolveService")
            return resolvedChannelService(String(args[1]));
          if (method === "subscribeChannel") return undefined;
          if (target === "main" && method === "authority.admitExecution") {
            admissions += 1;
            return {
              authoritySessionId: `admission:turn:${admissions}`,
              nonce: `nonce:turn:${admissions}`,
            };
          }
          if (method === "runAutomationTool") {
            dispatchKeys.push(
              (options as { idempotencyKey?: string }).idempotencyKey ?? "",
            );
            return undefined;
          }
          if (method === "describeAutomationRun") return executorStatus;
          if (method === "acknowledgeAutomationRun") {
            acknowledged = true;
            return undefined;
          }
          if (target === "main" && method === "authority.finishExecution")
            return undefined;
          if (target === "main" && method.startsWith("workspace-state.alarm"))
            return undefined;
          throw new Error(`Unexpected RPC ${target}.${method}`);
        },
      );
      const mission = await harness.callAs(alice, "launch", {
        name: "Daily summary",
        authorityPlan: policy(),
        charter: (() => {
          const charter = agentCharter();
          if (charter.execution.kind !== "agent")
            throw new Error("Expected agent");
          charter.execution.action = {
            kind: "tool",
            tool: "refreshNow",
            args: { briefing: false },
          };
          return charter;
        })(),
      });
      const run = await harness.callAs(alice, "runNow", mission.missionId);
      expect(run.phase, JSON.stringify(run.failure)).toBe("executing");
      const wake = await harness.instance.alarm();
      expect(wake).toBeNull();
      await harness.instance.resumeAfterRestart(RESTART);

      expect(dispatchKeys).toEqual([`${run.runId}:dispatch`]);
      expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
        phase: "executing",
      });

      executorStatus = { state: "not-found" };
      await harness.instance.resumeAfterRestart(RESTART);

      expect(dispatchKeys).toEqual([
        `${run.runId}:dispatch`,
        `${run.runId}:dispatch`,
      ]);
      expect(
        harness.sql
          .exec(
            "SELECT authority_session_id FROM mission_runs WHERE run_id=?",
            run.runId,
          )
          .one(),
      ).toEqual({ authority_session_id: "admission:turn:3" });

      executorStatus = {
        state: "terminal",
        outcome: "succeeded",
        finalMessage: "Summary sent.",
      };
      await harness.instance.resumeAfterRestart(RESTART);
      expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
        phase: "terminal",
        outcome: "succeeded",
        finalMessage: "Summary sent.",
      });
      expect(acknowledged).toBe(true);
      expect(
        harness.lifecycleCalls.some(
          (call) => call.method === "workspace-state.lifecycleLeaseUpsert",
        ),
      ).toBe(true);
    },
  );

  it("skips a scheduled occurrence that was missed while the workspace was unavailable", async () => {
    const harness = await createMissions();
    const charter = agentCharter();
    charter.trigger = { kind: "schedule", everyMs: 60_000 };
    const mission = await harness.callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter,
    });
    const now = Date.now();
    harness.sql.exec(
      "UPDATE missions SET next_run_at=? WHERE mission_id=?",
      now - 5_001,
      mission.missionId,
    );

    const wake = await harness.instance.alarm();

    expect(
      harness.sql.exec("SELECT COUNT(*) AS count FROM mission_runs").one(),
    ).toEqual({ count: 0 });
    expect(wake?.wakeAt).toBeGreaterThan(now);
  });

  it("records failed child effects without misreporting the run as succeeded", async () => {
    const harness = await createMissions(IdempotentCommandMissionsDO);
    const gadTarget = GAD_TARGET;
    let gadAvailable = false;
    let closeAvailable = false;
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      harness.calls.push({ target, method, args });
      if (target === "main" && method === "authority.verifyAuthorityPlan")
        return policy();
      if (target === "main" && method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (target === "main" && method === "runtime.createContext")
        return { contextId: "ctx:fresh" };
      if (target === "main" && method === "runtime.createEntity")
        return runtimeEntityReply(args, "ctx:fresh");
      if (
        target === "main" &&
        method === "workers.resolveService" &&
        args[0] === "vibestudio.channel.v1"
      )
        return resolvedChannelService(String(args[1]));
      if (method === "subscribeChannel" || method === "runAutomationTurn")
        return undefined;
      if (method === "acknowledgeAutomationRun") return undefined;
      if (target === "main" && method === "authority.admitExecution")
        return { authoritySessionId: "admission:turn", nonce: "nonce:turn" };
      if (target === "main" && method === "authority.finishExecution") {
        if (!closeAvailable) throw new Error("authority closure unavailable");
        return undefined;
      }
      if (target === "main" && method === "workers.resolveService")
        return resolvedGadService();
      if (target === gadTarget && method === "putUserNotification") {
        if (!gadAvailable) throw new Error("GAD temporarily unavailable");
        return args[0];
      }
      if (target === "main" && method.startsWith("workspace-state.alarm"))
        return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const charter = agentCharter();
    charter.trigger = { kind: "schedule", everyMs: 60_000, maxRuns: 1 };
    const mission = await harness.callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter,
    });
    const run = await harness.callAs(alice, "runNow", mission.missionId);
    const executorId = run.executorId!;
    expect(executorId).toMatch(
      /^do:workers\/summary:SummaryAgent:daily-run_[a-f0-9]+$/,
    );
    expect(
      harness.calls.some(
        ({ target, method }) =>
          target === "main" && method === "authority.admitExecution",
      ),
    ).toBe(true);
    const effectFailure = {
      source: {
        kind: "native-tool" as const,
        invocationId: "notify-call",
        nativeTaskId: 12,
        nativeEntryId: 13,
      },
      name: "notify",
      outcome: "tool_error" as const,
      code: "EDELIVERY",
      message: "Notification delivery failed",
    };

    const finishInput = {
      runId: run.runId,
      outcome: "completed-with-errors" as const,
      finalMessage: "The notification could not be delivered.",
      effectFailures: [effectFailure],
    };

    await expect(
      harness.callAs(
        { callerId: executorId, callerKind: "do" },
        "finishRun",
        finishInput,
      ),
    ).rejects.toThrow("authority closure unavailable");
    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "executing",
    });

    closeAvailable = true;
    await harness.callAs(
      { callerId: executorId, callerKind: "do" },
      "finishRun",
      finishInput,
    );

    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "terminal",
      outcome: "completed-with-errors",
      effectFailures: [effectFailure],
    });
    const overview = await harness.callAs(alice, "overview", {
      missionId: mission.missionId,
    });
    expect(overview.items[0]?.issueRunsSince).toBe(1);
    expect(await harness.callAs(alice, "get", mission.missionId)).toMatchObject(
      { state: "completed", completionReason: "max-runs" },
    );
    expect(
      harness.sql.exec("SELECT attempts FROM mission_effects").one(),
    ).toEqual({
      attempts: 1,
    });
    expect(
      harness.rpcCall.mock.calls.find(
        ([target, method]) =>
          target === gadTarget && method === "putUserNotification",
      ),
    ).toMatchObject([
      gadTarget,
      "putUserNotification",
      [
        expect.objectContaining({
          id: `automation.run.issue:${run.runId}`,
          userId: "alice",
          kind: "automation.run.issue",
          message: "notify: Notification delivery failed",
        }),
      ],
      undefined,
    ]);

    gadAvailable = true;
    harness.sql.exec("UPDATE mission_effects SET next_attempt_at=0");
    await harness.instance.alarm();
    expect(
      harness.sql.exec("SELECT COUNT(*) AS count FROM mission_effects").one(),
    ).toEqual({
      count: 0,
    });
  });

  it("keeps a retryable remote failure nonterminal and later settles the same run", async () => {
    const harness = await createMissions(IdempotentCommandMissionsDO);
    let dispatches = 0;
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      if (target === "main" && method === "authority.verifyAuthorityPlan")
        return policy();
      if (target === "main" && method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (target === "main" && method === "runtime.createEntity")
        return runtimeEntityReply(args);
      if (target === "main" && method === "authority.admitExecution")
        return { authoritySessionId: "admission:retry", nonce: "nonce:retry" };
      if (target === "main" && method === "authority.finishExecution")
        return undefined;
      if (
        target === "do:workers/rollout:RolloutWorker:primary" &&
        method === "check"
      ) {
        dispatches += 1;
        if (dispatches === 1)
          throw Object.assign(new Error("transport unavailable"), {
            code: "EUNAVAILABLE",
          });
        return { ready: true };
      }
      if (target === "main" && method.startsWith("workspace-state.alarm"))
        return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      name: "Rollout check",
      authorityPlan: policy(),
      charter: methodCharter(),
    });
    await expect(
      harness.callAs(alice, "runNow", mission.missionId),
    ).rejects.toThrow("transport unavailable");
    const first = (
      await harness.callAs(alice, "listRuns", mission.missionId, {})
    ).items[0]!;
    expect(first).toMatchObject({
      phase: "executing",
      failure: { code: "EUNAVAILABLE", retry: "automatic" },
    });
    await harness.instance.resumeAfterRestart(RESTART);

    expect(dispatches).toBe(2);
    expect(await harness.callAs(alice, "getRun", first.runId)).toMatchObject({
      runId: first.runId,
      phase: "terminal",
      outcome: "succeeded",
    });
  });

  it("switches revisions before closing old executions and retiring old authority", async () => {
    const harness = await createMissions(IdempotentCommandMissionsDO);
    let compileCount = 0;
    const lifecycleObservations: Array<{
      method: string;
      revision: number;
      state: string;
    }> = [];
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      if (target === "main" && method === "authority.verifyAuthorityPlan") {
        compileCount += 1;
        return policy(compileCount === 1 ? HASH_C : HASH_B);
      }
      if (target === "main" && method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (target === "main" && method === "runtime.createContext")
        return { contextId: "ctx:lifecycle" };
      if (target === "main" && method === "runtime.createEntity")
        return runtimeEntityReply(args, "ctx:lifecycle");
      if (target === "main" && method === "workers.resolveService")
        return resolvedChannelService(String(args[1]));
      if (method === "subscribeChannel" || method === "runAutomationTurn")
        return undefined;
      if (target === "main" && method === "authority.admitExecution")
        return {
          authoritySessionId: "admission:lifecycle",
          nonce: "nonce:lifecycle",
        };
      if (
        target === "main" &&
        (method === "authority.finishExecution" ||
          method === "authority.retireTarget")
      ) {
        const row = harness.sql
          .exec("SELECT revision,state FROM missions")
          .one();
        lifecycleObservations.push({
          method,
          revision: Number(row["revision"]),
          state: String(row["state"]),
        });
        return method === "authority.retireTarget"
          ? { cancelledRequestCount: 0, revokedGrantCount: 0 }
          : undefined;
      }
      if (target === "main" && method.startsWith("workspace-state.alarm"))
        return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      name: "Daily summary",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    await harness.callAs(alice, "runNow", mission.missionId);

    await harness.callAs(alice, "edit", mission.missionId, {
      authorityPlan: policy(HASH_B),
      charter: agentCharter("Prepare a focused summary"),
    });

    expect(lifecycleObservations).toEqual([
      { method: "authority.finishExecution", revision: 2, state: "active" },
      { method: "authority.retireTarget", revision: 2, state: "active" },
    ]);
  });
});

describe("MissionsDO durable execution ownership", () => {
  it("runs fresh executors without borrowing the manual command's caller or task closure", async () => {
    const harness = await createMissions(ExecutionOwnershipMissionsDO);
    const instance = harness.instance;
    if (!(instance instanceof ExecutionOwnershipMissionsDO))
      throw new Error("Expected the execution ownership fixture");
    const invocations: Array<{
      method: string;
      invocation: ReturnType<ExecutionOwnershipMissionsDO["invocationForTest"]>;
    }> = [];
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      invocations.push({ method, invocation: instance.invocationForTest() });
      if (method === "authority.verifyAuthorityPlan") return policy();
      if (method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (method === "runtime.createContext")
        return { contextId: "context:owned-run" };
      if (method === "runtime.createEntity") return runtimeEntityReply(args);
      if (method === "workers.resolveService")
        return resolvedChannelService(String(args[1]));
      if (method === "subscribeChannel" || method === "runAutomationTurn")
        return undefined;
      if (method === "authority.admitExecution")
        return {
          authoritySessionId: "admission:owned-run",
          nonce: "nonce:owned-run",
        };
      if (method.startsWith("workspace-state.alarm")) return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      authorityPlan: policy(),
      name: "Independent mission",
      charter: agentCharter(),
    });
    invocations.length = 0;
    const run = await harness.callAs(alice, "runNow", mission.missionId);
    expect(run).toMatchObject({
      phase: "executing",
      authoritySessionId: "admission:owned-run",
    });
    expect(
      invocations.find((call) => call.method === "authority.acquireForTarget")
        ?.invocation,
    ).toMatchObject({
      caller: { callerId: alice.callerId, userId: alice.userId },
      authorization: expect.any(Object),
    });
    const executionCalls = invocations.filter((call) =>
      [
        "runtime.createContext",
        "runtime.createEntity",
        "subscribeChannel",
        "authority.admitExecution",
        "runAutomationTurn",
      ].includes(call.method),
    );
    expect(executionCalls.map((call) => call.method)).toEqual(
      expect.arrayContaining([
        "runtime.createContext",
        "runtime.createEntity",
        "subscribeChannel",
        "authority.admitExecution",
        "runAutomationTurn",
      ]),
    );
    for (const call of executionCalls)
      expect(call.invocation).toEqual({ caller: null, authorization: null });
    expect(instance.commandAfterExecution).toMatchObject({
      caller: { callerId: alice.callerId, userId: alice.userId },
      authorization: expect.any(Object),
    });
    expect(instance.invocationForTest()).toEqual({
      caller: null,
      authorization: null,
    });
  });
});

describe("MissionsDO cancellation ownership", () => {
  it("joins admission across suspension and rejects new runs after its release barrier", async () => {
    const harness = await createMissions();
    let entered!: () => void;
    let accept!: () => void;
    const dispatchEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const accepted = new Promise<void>((resolve) => {
      accept = resolve;
    });
    harness.rpcCall.mockImplementation(async (target, method) => {
      if (method === "authority.verifyAuthorityPlan") return policy();
      if (method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (method === "runAutomationTurn") {
        entered();
        await accepted;
        return undefined;
      }
      if (method.startsWith("workspace-state.alarm")) return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      name: "Joined dispatch",
      authorityPlan: policy(),
      charter: continuingAgentCharter(),
    });
    const start = harness.callAs(alice, "runNow", mission.missionId);
    await dispatchEntered;
    let released = false;
    const release = harness.instance
      .releaseForLifecycle({
        epoch: "suspend",
        phase: "release",
        mode: "suspend",
        reason: "restart",
        deadlineMs: 0,
      })
      .then((result) => {
        released = true;
        return result;
      });
    await Promise.resolve();
    expect(released).toBe(false);
    await expect(
      harness.callAs(alice, "runNow", mission.missionId),
    ).rejects.toThrow("sealed");
    accept();
    expect(await start).toMatchObject({ phase: "executing" });
    expect(await release).toEqual({ status: "ready" });
    expect(
      harness.sql.exec("SELECT COUNT(*) AS count FROM mission_runs").one(),
    ).toEqual({ count: 1 });
  });
  it("retires only after it durably requests and joins cancellation of a blocked dispatch", async () => {
    const harness = await createMissions();
    let dispatchEntered!: () => void;
    let interruptEntered!: () => void;
    let finishDispatch!: () => void;
    const entered = new Promise<void>((resolve) => {
      dispatchEntered = resolve;
    });
    const interrupted = new Promise<void>((resolve) => {
      interruptEntered = resolve;
    });
    const dispatch = new Promise<void>((resolve) => {
      finishDispatch = resolve;
    });
    harness.rpcCall.mockImplementation(async (_target, method, args = []) => {
      harness.calls.push({ target: _target, method, args });
      if (method === "authority.verifyAuthorityPlan") return policy();
      if (method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (method === "runAutomationTurn") {
        dispatchEntered();
        await dispatch;
        return undefined;
      }
      if (method === "interruptChannel") {
        expect(
          harness.sql
            .exec("SELECT value FROM state WHERE key LIKE 'cancel-run:%'")
            .toArray(),
        ).toHaveLength(1);
        interruptEntered();
        finishDispatch();
        return { interrupted: true };
      }
      if (method.startsWith("workspace-state.alarm")) return undefined;
      throw new Error(`Unexpected RPC ${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      name: "Retired active work",
      authorityPlan: policy(),
      charter: continuingAgentCharter(),
    });
    const start = harness.callAs(alice, "runNow", mission.missionId);
    await entered;

    const release = harness.instance.releaseForLifecycle({
      epoch: "retire",
      phase: "release",
      mode: "retire",
      reason: "delete",
      deadlineMs: 0,
    });
    await interrupted;
    expect(await release).toEqual({ status: "ready" });
    expect(await start).toMatchObject({
      phase: "terminal",
      outcome: "cancelled",
    });
    expect(
      harness.lifecycleCalls.some(
        (call) => call.method === "workspace-state.lifecycleLeaseClear",
      ),
    ).toBe(true);
  });
  it.each(["user cancellation", "lifecycle retirement"] as const)(
    "propagates %s through a blocked method RPC as cancellation, not failure",
    async (kind) => {
      const harness = await createMissions();
      let methodEntered!: () => void;
      const entered = new Promise<void>((resolve) => {
        methodEntered = resolve;
      });
      let methodSignal: AbortSignal | undefined;
      harness.rpcCall.mockImplementation(
        async (target, method, args = [], options) => {
          if (method === "authority.verifyAuthorityPlan") return policy();
          if (method === "authority.acquireForTarget")
            return { requestIds: [], grantIds: [], denialIds: [] };
          if (method === "runtime.createContext")
            return { contextId: "context:cancel-method" };
          if (method === "runtime.createEntity")
            return runtimeEntityReply(args);
          if (method === "authority.admitExecution")
            return {
              authoritySessionId: "admission:cancel-method",
              nonce: "nonce:cancel-method",
            };
          if (method === "check") {
            methodSignal = (options as { signal?: AbortSignal } | undefined)
              ?.signal;
            methodEntered();
            return new Promise((_resolve, reject) => {
              if (!methodSignal)
                throw new Error("Method execution omitted its owner signal");
              methodSignal.addEventListener(
                "abort",
                () => reject(methodSignal?.reason),
                { once: true },
              );
            });
          }
          if (
            method === "authority.finishExecution" ||
            method.startsWith("workspace-state.alarm")
          )
            return undefined;
          throw new Error(
            `Unexpected RPC ${target}.${method} ${JSON.stringify(args)}`,
          );
        },
      );
      const mission = await harness.callAs(alice, "launch", {
        name: "Cancelable method",
        authorityPlan: policy(),
        charter: methodCharter(),
      });
      const start = harness.callAs(alice, "runNow", mission.missionId);
      await entered;

      if (kind === "user cancellation") {
        await harness.callAs(alice, "cancel", mission.missionId);
      } else {
        expect(
          await harness.instance.releaseForLifecycle({
            epoch: "retire-method",
            phase: "release",
            mode: "retire",
            reason: "delete",
            deadlineMs: 0,
          }),
        ).toEqual({ status: "ready" });
      }
      expect(methodSignal?.aborted).toBe(true);
      expect(await start).toMatchObject({
        phase: "terminal",
        outcome: "cancelled",
      });
      expect(
        await harness.callAs(alice, "getRun", (await start).runId),
      ).toMatchObject({
        phase: "terminal",
        outcome: "cancelled",
      });
    },
  );
  it("retries a remote terminal receipt and authority closure after activation resumes", async () => {
    const harness = await createMissions(IdempotentCommandMissionsDO);
    let closeAvailable = false;
    let closeCalls = 0;
    const receiver = async (
      target: string,
      method: string,
      args: unknown[] = [],
    ) => {
      if (target === "main" && method === "authority.verifyAuthorityPlan")
        return policy();
      if (target === "main" && method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (target === "main" && method === "runtime.createContext")
        return { contextId: "ctx:resume-terminal" };
      if (target === "main" && method === "runtime.createEntity")
        return runtimeEntityReply(args, "ctx:resume-terminal");
      if (
        target === "main" &&
        method === "workers.resolveService" &&
        args[0] === "vibestudio.channel.v1"
      )
        return resolvedChannelService(String(args[1]));
      if (
        method === "subscribeChannel" ||
        method === "runAutomationTurn" ||
        method === "acknowledgeAutomationRun"
      )
        return undefined;
      if (target === "main" && method === "authority.admitExecution")
        return {
          authoritySessionId: "admission:resume-terminal",
          nonce: "nonce:resume-terminal",
        };
      if (target === "main" && method === "authority.finishExecution") {
        closeCalls += 1;
        if (!closeAvailable)
          throw Object.assign(new Error("authority closure unavailable"), {
            code: "EUNAVAILABLE",
          });
        return undefined;
      }
      if (method === "describeAutomationRun")
        return {
          state: "terminal",
          outcome: "succeeded",
          finalMessage: "Persisted remote receipt",
        };
      if (target === "main" && method.startsWith("workspace-state.alarm"))
        return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    };
    harness.rpcCall.mockImplementation(receiver);
    const mission = await harness.callAs(alice, "launch", {
      name: "Resume terminal receipt",
      authorityPlan: policy(),
      charter: agentCharter(),
    });
    const run = await harness.callAs(alice, "runNow", mission.missionId);
    expect(run.phase).toBe("executing");

    const reopened = await createMissions(
      IdempotentCommandMissionsDO,
      harness.db,
    );
    reopened.rpcCall.mockImplementation(receiver);
    await expect(reopened.instance.resumeAfterRestart(RESTART)).rejects.toThrow(
      "authority closure unavailable",
    );
    expect(await reopened.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "executing",
    });

    closeAvailable = true;
    await reopened.instance.resumeAfterRestart(RESTART);
    expect(closeCalls).toBe(2);
    expect(await reopened.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "terminal",
      outcome: "succeeded",
      finalMessage: "Persisted remote receipt",
    });
  });
  it("pauses recurrence and joins an executing agent before terminalizing its run", async () => {
    const harness = await createMissions();
    let interruptEntered!: () => void;
    let finishInterrupt!: () => void;
    const entered = new Promise<void>((resolve) => {
      interruptEntered = resolve;
    });
    const interrupted = new Promise<void>((resolve) => {
      finishInterrupt = resolve;
    });
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      harness.calls.push({ target, method, args });
      if (method === "authority.verifyAuthorityPlan") return policy();
      if (method === "runAutomationTool") return undefined;
      if (method === "interruptChannel") {
        interruptEntered();
        await interrupted;
        return { interrupted: true };
      }
      if (method.startsWith("workspace-state.alarm")) return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const charter = continuingAgentCharter();
    if (charter.execution.kind !== "agent") throw new Error("Expected agent");
    charter.execution.action = {
      kind: "tool",
      tool: "refreshNow",
      args: { briefing: false },
    };
    charter.trigger = { kind: "schedule", everyMs: 60000 };
    const mission = await harness.callAs(alice, "launch", {
      authorityPlan: policy(),
      name: "Recurring review",
      charter,
    });
    const run = await harness.callAs(alice, "runNow", mission.missionId);
    const cancellation = harness.callAs(alice, "cancel", mission.missionId);
    await entered;
    expect(await harness.callAs(alice, "get", mission.missionId)).toMatchObject(
      { state: "paused" },
    );
    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "executing",
    });
    finishInterrupt();
    expect(await cancellation).toMatchObject({
      missionId: mission.missionId,
      state: "paused",
    });
    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "terminal",
      outcome: "cancelled",
    });
    expect(
      harness.calls.filter((call) => call.method === "runAutomationTool"),
    ).toHaveLength(1);
    expect(
      harness.calls.find((call) => call.method === "interruptChannel"),
    ).toMatchObject({
      target: "do:workers/summary:SummaryAgent:daily",
      args: ["conversation:daily", true],
    });
    expect(
      harness.sql
        .exec("SELECT key FROM state WHERE key LIKE 'cancel-run:%'")
        .toArray(),
    ).toEqual([]);
    expect(
      await harness.callAs(alice, "resume", mission.missionId),
    ).toMatchObject({ state: "active" });
  });

  it("joins in-flight context preparation and never dispatches after cancellation was requested", async () => {
    const harness = await createMissions();
    let contextEntered!: () => void;
    let finishContext!: (value: { contextId: string }) => void;
    const entered = new Promise<void>((resolve) => {
      contextEntered = resolve;
    });
    const prepared = new Promise<{ contextId: string }>((resolve) => {
      finishContext = resolve;
    });
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      harness.calls.push({ target, method, args });
      if (method === "authority.verifyAuthorityPlan") return policy();
      if (method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (method === "runtime.createContext") {
        contextEntered();
        return prepared;
      }
      if (method === "runtime.createEntity")
        return runtimeEntityReply(args, "context:prepared");
      if (method.startsWith("workspace-state.alarm")) return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      authorityPlan: policy(),
      name: "Prepared work",
      charter: agentCharter(),
    });
    const start = harness.callAs(alice, "runNow", mission.missionId);
    await entered;
    const cancellation = harness.callAs(alice, "cancel", mission.missionId);
    // The queued RPC enters asynchronously. Reading the paused owner after it
    // verifies that the cancellation intent was accepted before inspecting it.
    expect(await harness.callAs(alice, "get", mission.missionId)).toMatchObject(
      { state: "paused" },
    );
    expect(
      harness.sql
        .exec("SELECT phase,context_id FROM mission_runs")
        .one(),
    ).toEqual({ phase: "context-preparing", context_id: null });
    expect(
      harness.sql
        .exec("SELECT key FROM state WHERE key LIKE 'cancel-run:%'")
        .toArray(),
    ).toHaveLength(1);
    finishContext({ contextId: "context:prepared" });
    const run = await start;
    await cancellation;
    expect(run).toMatchObject({
      phase: "terminal",
      outcome: "cancelled",
      contextId: "context:prepared",
    });
    expect(
      harness.calls.filter((call) =>
        [
          "runAutomationTurn",
          "authority.admitExecution",
          "subscribeChannel",
        ].includes(call.method),
      ),
    ).toEqual([]);
  });

  it("joins fresh task execution and closes its admitted authority before acknowledging cancellation", async () => {
    const harness = await createMissions();
    let closeEntered!: () => void;
    let finishClose!: () => void;
    const entered = new Promise<void>((resolve) => {
      closeEntered = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      harness.calls.push({ target, method, args });
      if (method === "authority.verifyAuthorityPlan") return policy();
      if (method === "authority.acquireForTarget")
        return { requestIds: [], grantIds: [], denialIds: [] };
      if (method === "runtime.createContext")
        return { contextId: "context:task" };
      if (method === "runtime.createEntity") return runtimeEntityReply(args);
      if (method === "workers.resolveService")
        return resolvedChannelService(String(args[1]));
      if (
        method === "subscribeChannel" ||
        method === "runAutomationTurn" ||
        method === "interruptChannel"
      )
        return undefined;
      if (method === "authority.admitExecution")
        return { authoritySessionId: "admission:task", nonce: "nonce:task" };
      if (method === "authority.finishExecution") {
        closeEntered();
        await closed;
        return undefined;
      }
      if (method.startsWith("workspace-state.alarm")) return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      authorityPlan: policy(),
      name: "Fresh task",
      charter: agentCharter(),
    });
    const run = await harness.callAs(alice, "runNow", mission.missionId);
    expect(run).toMatchObject({
      phase: "executing",
      authoritySessionId: "admission:task",
    });
    const cancellation = harness.callAs(alice, "cancel", mission.missionId);
    await entered;
    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "executing",
    });
    expect(
      harness.calls.find((call) => call.method === "interruptChannel"),
    ).toBeDefined();
    finishClose();
    await cancellation;
    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "terminal",
      outcome: "cancelled",
    });
    expect(
      harness.calls.find((call) => call.method === "authority.finishExecution"),
    ).toMatchObject({ args: [{ authoritySessionId: "admission:task" }] });
  });

  it("propagates the original interruption failure and retains the cancellation until retry joins it", async () => {
    const harness = await createMissions();
    let canInterrupt = false;
    harness.rpcCall.mockImplementation(async (target, method, args = []) => {
      harness.calls.push({ target, method, args });
      if (method === "authority.verifyAuthorityPlan") return policy();
      if (method === "runAutomationTurn") return undefined;
      if (method === "interruptChannel") {
        if (!canInterrupt)
          throw new Error("Executor stop failed: original evidence");
        return { interrupted: true };
      }
      if (method.startsWith("workspace-state.alarm")) return undefined;
      throw new Error(`Unexpected RPC ${target}.${method}`);
    });
    const mission = await harness.callAs(alice, "launch", {
      authorityPlan: policy(),
      name: "Work",
      charter: continuingAgentCharter(),
    });
    const run = await harness.callAs(alice, "runNow", mission.missionId);
    await expect(
      harness.callAs(alice, "cancel", mission.missionId),
    ).rejects.toThrow("Executor stop failed: original evidence");
    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "executing",
    });
    await expect(
      harness.callAs(alice, "resume", mission.missionId),
    ).rejects.toThrow(/cancellation.*finish/i);
    expect(
      harness.sql
        .exec("SELECT key FROM state WHERE key LIKE 'cancel-run:%'")
        .toArray(),
    ).toHaveLength(1);
    canInterrupt = true;
    await harness.callAs(alice, "cancel", mission.missionId);
    expect(await harness.callAs(alice, "getRun", run.runId)).toMatchObject({
      phase: "terminal",
      outcome: "cancelled",
    });
  });
});
