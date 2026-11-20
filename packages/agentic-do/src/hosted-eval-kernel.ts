import {
  callOrRestart,
  cpuLimitForTimeout,
  type HostCodeSpec,
  type HostedCode,
} from "@vibestudio/durable/codeHost";

/**
 * The eval kernel an agent hosts in its own cell (docs/dolt-redesign.md §6.11.6, §7.5.1).
 *
 * An agent is the hosting entity of its own kernel: nothing but its own root can name the
 * hosted class, so a call that reaches the kernel is from the agent and is served as `host`
 * (no admission nonce: the agent is the only principal the kernel has). The agent's methods
 * (`start`, `await`, ... in `AgentVesselBase`) authenticate their caller and relay here; the
 * host reaches the same methods for the three interlocks only it can perform.
 *
 * One kernel per agent, one notebook scope for the whole agent. A session entity keeps a
 * kernel per scope because it is created per scope; an agent is one entity and the host admits
 * one live run for an executing entity, so its kernel is one too.
 */
export const AGENT_KERNEL_SOURCE = "workers/eval-kernel";
export const AGENT_KERNEL_CLASS = "EvalKernel";
const KERNEL_NAME = "kernel";
const KERNEL_HOSTED_KEY = "kernel_hosted";

/** How long a call to the kernel may take before it is treated as not answering and restarted (§7.8). */
const KERNEL_CALL_BUDGET_MS = 60_000;
/** Cancellation may wait for an owner's cleanup handlers, and a reset for a stuck run's grace. */
const KERNEL_CONTROL_BUDGET_MS = 180_000;
const HOST_CALLER = { kind: "host" } as const;

/** What the relay needs of the entity that hosts the kernel. */
export interface EvalKernelHostEntity {
  hostCode(spec: HostCodeSpec): Promise<HostedCode>;
  getStateValue(key: string): string | null | undefined;
  setStateValue(key: string, value: string): void;
}

export interface EvalLifecycleInput {
  readonly phase: string;
  readonly [key: string]: unknown;
}

export class HostedEvalKernel {
  constructor(private readonly entity: EvalKernelHostEntity) {}

  /** Whether this entity has ever started its kernel (a listing never starts one). */
  get started(): boolean {
    return this.entity.getStateValue(KERNEL_HOSTED_KEY) === "1";
  }

  private kernel(): Promise<HostedCode> {
    this.entity.setStateValue(KERNEL_HOSTED_KEY, "1");
    return this.entity.hostCode({
      name: KERNEL_NAME,
      executable: { source: AGENT_KERNEL_SOURCE, className: AGENT_KERNEL_CLASS },
    });
  }

  /** Accept a run the host has admitted (§7.3): `nonce` is the one the admission returned. */
  async start(input: { runId: string } & Record<string, unknown>, nonce: string): Promise<unknown> {
    if (typeof input?.runId !== "string" || input.runId.length === 0)
      throw refusal("start needs a run id", "EINVAL");
    if (typeof nonce !== "string" || nonce.length === 0)
      throw refusal("start needs the admission nonce", "EINVAL");
    const hosted = await this.kernel();
    // The run's timeoutMs bounds its CPU: the limit rides on this one call (§7.8).
    const limits = cpuLimitForTimeout(input["timeoutMs"]);
    return callOrRestart(
      limits ? hosted.limited(limits) : hosted,
      KERNEL_CALL_BUDGET_MS,
      "start",
      { ...input, executionSessionNonce: nonce },
      HOST_CALLER
    );
  }

  async await(runId: string, options?: { waitMs?: number }): Promise<unknown> {
    return callOrRestart(
      await this.kernel(),
      Math.min(Math.max(options?.waitMs ?? 30_000, 0), 120_000) + KERNEL_CALL_BUDGET_MS,
      "await",
      runId,
      options ?? {},
      HOST_CALLER
    );
  }

  async events(runId: string, options?: { after?: number; limit?: number }): Promise<unknown> {
    return callOrRestart(
      await this.kernel(),
      KERNEL_CALL_BUDGET_MS,
      "events",
      runId,
      options ?? {},
      HOST_CALLER
    );
  }

  async cancel(runId: string): Promise<unknown> {
    return callOrRestart(
      await this.kernel(),
      KERNEL_CONTROL_BUDGET_MS,
      "cancel",
      runId,
      HOST_CALLER
    );
  }

  async get(runId: string): Promise<unknown> {
    return callOrRestart(await this.kernel(), KERNEL_CALL_BUDGET_MS, "get", runId, HOST_CALLER);
  }

  async receipt(runId: string): Promise<unknown> {
    return callOrRestart(await this.kernel(), KERNEL_CALL_BUDGET_MS, "receipt", runId, HOST_CALLER);
  }

  /** The agent's durable acknowledgement that it consumed the run's exact terminal result. */
  async acknowledge(
    runId: string,
    identity: { runDigest: string; resultDigest: string }
  ): Promise<unknown> {
    return callOrRestart(
      await this.kernel(),
      KERNEL_CALL_BUDGET_MS,
      "acknowledgeRunResult",
      runId,
      identity,
      HOST_CALLER
    );
  }

  /** Host only (the host gates a scope reset with its own approval before it calls this). */
  async reset(): Promise<unknown> {
    // A kernel that never started has nothing to reset, and a reset is not a reason to start one.
    if (!this.started) return { ok: true };
    return callOrRestart(
      await this.kernel(),
      KERNEL_CONTROL_BUDGET_MS,
      "reset",
      HOST_CALLER
    );
  }

  async readScopeTextPage(key: string, offset?: number, limit?: number): Promise<unknown> {
    return (await this.kernel()).call("readScopeTextPage", key, offset, limit, HOST_CALLER);
  }

  async deleteScopeValue(key: string): Promise<unknown> {
    return (await this.kernel()).call("deleteScopeValue", key, HOST_CALLER);
  }

  /** Facts only the host observes, recorded in the run's event log so a puller sees them in `events`. */
  async recordAuthorityEvent(runId: string, kind: string, payload: unknown): Promise<void> {
    await (await this.kernel()).call("appendAuthorityEvent", runId, kind, payload);
  }

  /** The host's publication interlock for a workspace bundle a notebook imports. */
  async retainExecutionRoot(
    runId: string,
    moduleSpecifier: string,
    artifact: unknown
  ): Promise<void> {
    await (await this.kernel()).call("retainExecutionRoot", runId, moduleSpecifier, artifact);
  }

  /** The workspace bundles this kernel retains, for the host's execution-root census. */
  async executionRoots(): Promise<unknown[]> {
    // An agent that never hosted a kernel has no roots to list, and listing is not a reason to start one.
    if (!this.started) return [];
    return (await this.kernel()).call("listRetainedExecutionRoots") as Promise<unknown[]>;
  }

  /** The entity's lifecycle reaches the kernel through it: runs are cancelled and owned panels retired. */
  async lifecycle(input: EvalLifecycleInput): Promise<void> {
    if (!this.started) return;
    const kernel = await this.kernel();
    await kernel.call("lifecycle", input);
    if (input.phase === "release") await kernel.release();
  }

  /** Ends the notebook heap's residency hold; the committed state stays with the entity. */
  async end(): Promise<{ ok: true }> {
    if (this.started) await (await this.kernel()).release();
    return { ok: true };
  }
}

function refusal(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}
