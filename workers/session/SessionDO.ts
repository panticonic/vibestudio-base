import {
  DurableObjectBase,
  rpc,
  type DurableObjectContext,
} from "@workspace/runtime/worker/kernel";
import type { HostedCode } from "@vibestudio/durable/codeHost";
import type { LifecyclePrepareInput } from "@workspace/runtime/worker/kernel";
import type {
  KernelCaller,
  KernelEventPage,
  KernelRunSnapshot,
  KernelStartAck,
} from "../eval-kernel/contract.js";

/** The class of dynamic code a session entity hosts (the manifest's `hosts` entry names the same). */
export const SESSION_KERNEL_SOURCE = "workers/eval-kernel";
export const SESSION_KERNEL_CLASS = "EvalKernel";
const KERNEL_NAME = "kernel";
const KERNEL_HOSTED_KEY = "kernel_hosted";

const SETTLE_METHODS: ReadonlySet<string> = new Set([
  "appendAuthorityEvent",
  "failPendingRun",
  "acknowledgeRunResult",
  "retainExecutionRoot",
  "listRetainedExecutionRoots",
]);

const WEBSITE_CLOSED = {
  kind: "closed",
  reason: "A session holds a principal's notebook and its runs; it is not exposed to websites.",
} as const;

/** The rpc authority every session method shares: callers are checked in the class (`authorizeCaller`). */
const SESSION_METHOD = {
  website: WEBSITE_CLOSED,
  principals: ["host", "code", "session"],
  effect: { kind: "open" },
  tier: "open",
} as const;

function refuse(message: string, code: string): never {
  throw Object.assign(new Error(message), { code });
}

/**
 * A session entity (docs/dolt-redesign.md §7.2 and §7.5.1).
 *
 * Panels, the CLI and the system-test runner have no root of their own, so
 * they cannot host code. A session entity is the entity that does: it is created
 * through `runtime.createEntity` with the initiating caller as its parent (the
 * lineage `resolveParentPanel` walks), keyed `session:<principal>:<scope>`, and
 * it hosts one kernel (a class of dynamic code) with `hostCode`.
 *
 * The host does not check "may this caller reach that kernel": only this entity
 * can. This class therefore does two things and nothing else:
 *
 *  - it authenticates its caller. It serves exactly one principal (named in its
 *    `stateArgs`); a caller is accepted if it is that principal or the host
 *    service acting for it (a call the host has verified and admitted);
 *  - it relays the kernel's call contract (`start`, `await`, `events`,
 *    `cancel`, ...) with the admission nonce of the run it names, which the
 *    kernel checks again (§7.5.1). It keeps `(runId, nonce)` in its own table
 *    so a principal that returns after a restart can pull.
 */
export class SessionDO extends DurableObjectBase {
  static override schemaVersion = 1;

  constructor(ctx: DurableObjectContext, env: unknown) {
    super(ctx, env);
  }

  protected createTables(): void {
    this.sql.exec(`
      CREATE TABLE session_runs (
        run_id TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        admitted_at INTEGER NOT NULL
      )
    `);
  }

  protected override requiredTables(): readonly string[] {
    return ["session_runs"];
  }

  /** The one principal this session serves, from the creation `stateArgs`. */
  private principalId(): string {
    const principal = this.ctx.props?.stateArgs?.["principalId"];
    if (typeof principal !== "string" || principal.length === 0)
      refuse("This session has no principal", "EINVAL");
    return principal;
  }

  /** The principal itself, or the host acting for it. */
  private authorizeCaller(): void {
    const caller = this.caller;
    if (!caller) refuse("A session call needs an authenticated caller", "EACCES");
    if (caller.callerKind === "server") return;
    if (caller.callerId !== this.principalId())
      refuse("This session serves another principal", "EACCES");
  }

  private kernel(): Promise<HostedCode> {
    this.setStateValue(KERNEL_HOSTED_KEY, "1");
    return this.hostCode({
      name: KERNEL_NAME,
      executable: { source: SESSION_KERNEL_SOURCE, className: SESSION_KERNEL_CLASS },
    });
  }

  private nonceOf(runId: string): string {
    const row = this.sql
      .exec(`SELECT nonce FROM session_runs WHERE run_id = ?`, runId)
      .toArray()[0];
    if (!row) refuse(`Run ${runId} was not admitted by this session`, "ENOTFOUND");
    return String(row["nonce"]);
  }

  /** Scope-level calls name no run: the newest admission's nonce, or none when there is no run yet. */
  private scopeCaller(): KernelCaller {
    const row = this.sql
      .exec(`SELECT nonce FROM session_runs ORDER BY admitted_at DESC, rowid DESC LIMIT 1`)
      .toArray()[0];
    return { kind: "session", admissionNonce: row ? String(row["nonce"]) : "" };
  }

  private runCaller(runId: string): KernelCaller {
    return { kind: "session", admissionNonce: this.nonceOf(runId) };
  }

  /** Accept a run the host has admitted (§7.3): `admissionNonce` is the one the admission returned. */
  @rpc({ ...SESSION_METHOD, sensitivity: "write" })
  async start(
    input: { runId: string } & Record<string, unknown>,
    admissionNonce: string
  ): Promise<KernelStartAck> {
    this.authorizeCaller();
    if (typeof input?.runId !== "string" || input.runId.length === 0)
      refuse("start needs a run id", "EINVAL");
    if (typeof admissionNonce !== "string" || admissionNonce.length === 0)
      refuse("start needs the admission nonce", "EINVAL");
    // Recorded before the kernel hears of it: a start whose answer is lost is retried
    // with a fresh admission, and the retry replaces the nonce the kernel refreshes.
    this.sql.exec(
      `INSERT INTO session_runs (run_id, nonce, admitted_at) VALUES (?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET nonce = excluded.nonce`,
      input.runId,
      admissionNonce,
      Date.now()
    );
    const kernel = await this.kernel();
    try {
      return await kernel.call<KernelStartAck>(
        "start",
        { ...input, executionSessionNonce: admissionNonce },
        {
          kind: "session",
          admissionNonce,
        } satisfies KernelCaller
      );
    } catch (error) {
      // A refused start leaves no run behind to pull.
      this.sql.exec(
        `DELETE FROM session_runs WHERE run_id = ? AND nonce = ?`,
        input.runId,
        admissionNonce
      );
      throw error;
    }
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "read" })
  async await(runId: string, options?: { waitMs?: number }): Promise<KernelRunSnapshot> {
    this.authorizeCaller();
    return (await this.kernel()).call("await", runId, options ?? {}, this.runCaller(runId));
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "read" })
  async events(
    runId: string,
    options?: { after?: number; limit?: number }
  ): Promise<KernelEventPage> {
    this.authorizeCaller();
    return (await this.kernel()).call("events", runId, options ?? {}, this.runCaller(runId));
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "write" })
  async cancel(runId: string): Promise<{ ok: true; forcedReset: boolean }> {
    this.authorizeCaller();
    return (await this.kernel()).call("cancel", runId, this.runCaller(runId));
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "read" })
  async get(runId: string): Promise<KernelRunSnapshot> {
    this.authorizeCaller();
    return (await this.kernel()).call("get", runId, this.runCaller(runId));
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "read" })
  async receipt(runId: string): Promise<unknown> {
    this.authorizeCaller();
    return (await this.kernel()).call("receipt", runId, this.runCaller(runId));
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "write" })
  async reset(): Promise<{ ok: boolean }> {
    this.authorizeCaller();
    const result = await (await this.kernel()).call<{ ok: boolean }>("reset", this.scopeCaller());
    // The kernel kept no run, so the session keeps no nonce for one.
    this.sql.exec(`DELETE FROM session_runs`);
    return result;
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "read" })
  async readScopeTextPage(key: string, offset?: number, limit?: number): Promise<unknown> {
    this.authorizeCaller();
    return (await this.kernel()).call("readScopeTextPage", key, offset, limit, this.scopeCaller());
  }

  @rpc({ ...SESSION_METHOD, sensitivity: "write" })
  async deleteScopeValue(key: string): Promise<{ ok: boolean; existed: boolean }> {
    this.authorizeCaller();
    return (await this.kernel()).call("deleteScopeValue", key, this.scopeCaller());
  }

  /**
   * The host's settlement paths of the push model, until pull replaces them
   * (docs/dolt-redesign.md §7.5, §7.12 steps 5 and 6): authority events, the
   * execution roots, acknowledgement. Host only: no session principal calls them.
   */
  @rpc({ ...SESSION_METHOD, principals: ["host"], sensitivity: "write" })
  async settle(method: string, args?: unknown[]): Promise<unknown> {
    if (this.caller?.callerKind !== "server") refuse("settle is for the host", "EACCES");
    if (!SETTLE_METHODS.has(method)) refuse(`${method} is not a settlement path`, "EINVAL");
    return (await this.kernel()).call(method, ...(args ?? []));
  }

  /**
   * Retirement and suspension reach the kernel through this entity: its runs are
   * cancelled and the panels it opened retired before the entity goes (a hosted
   * class has no lifecycle of its own), then the heap's hold ends.
   */
  override async releaseForLifecycle(input: LifecyclePrepareInput): Promise<{ status: "ready" }> {
    if (this.getStateValue(KERNEL_HOSTED_KEY) === "1") {
      const kernel = await this.kernel();
      await kernel.call("lifecycle", input);
      if (input.phase === "release") await kernel.release();
    }
    return super.releaseForLifecycle(input) as Promise<{ status: "ready" }>;
  }

  /**
   * Ends the notebook heap's residency hold. The kernel's committed state stays
   * until the session entity is retired; the heap may now be evicted.
   */
  @rpc({ ...SESSION_METHOD, sensitivity: "write" })
  async end(): Promise<{ ok: true }> {
    this.authorizeCaller();
    await (await this.kernel()).release();
    return { ok: true };
  }
}
