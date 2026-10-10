import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import type { Context } from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  defineExtension,
  type Registry,
  type Harness,
  HarnessOptions,
  ModelRequestApi,
  ModelRequestConnection,
  ModelRequestPort,
  ModelRequestTarget,
  ModelRequestWait,
  type ToolExecutionApi,
} from "@panticonic/pi-durable";
import {
  applySqliteMigrationsInTransaction,
  nativeSqliteExecutor,
  NativeDatabase,
  type NativeStorage,
  SqliteStorage,
} from "@panticonic/pi-durable/storage/sqlite";
import type { DurableObjectSchemaDescriptor } from "@vibestudio/durable/schema";
import { rpc, serializeRpcFailure, withRpcContext, type RpcClient, type AcquisitionInfo, type RpcCaller } from "@vibestudio/rpc";
import { mergeRpcOptions } from "@vibestudio/rpc/internal";
import { evalRuntimeId } from "@vibestudio/shared/evalRuntimeIdentity";
import { evalGetArgsSchema } from "@vibestudio/service-schemas/eval";
import { authorityMethods } from "@vibestudio/service-schemas/authority";
import { nativeInvocationInspectionInputSchema } from "@vibestudio/service-schemas/nativeInvocation";
import { inspectNativeInvocationSource } from "./native-invocation-source.js";
import { nativeFailureDiagnostic } from "./native-failure-diagnostic.js";
import type {
  DurableObjectContext,
  LifecyclePrepareInput,
  LifecyclePrepareResult,
  LifecycleResumeInput,
} from "@workspace/runtime/worker/durable-base";
import { PanelDurableObjectBase } from "@workspace/runtime/worker/panel-durable-base";
import {
  type AgentHostCall,
  type LoadedAgentImage,
  openPlatformAgentSession,
  retireBoundAgentSession,
} from "./native-agent-session.js";
import {
  consumeEvalReceipt,
  createNativeEvalAcknowledgements,
  retainedEvalRunRoute,
} from "./native-eval-receipts.js";
import {
  bindAuthorityAcquisition,
  consumeAuthorityReceipt,
  reconcileAuthorityReceipts,
  withdrawFailedModelRequestAuthorities,
  withdrawNativeToolAuthorities,
  type AuthorityInvocation,
} from "./native-authority-receipts.js";

/** Product owners must supply the protected request boundary; Pi's standalone default is not product admission. */
export type NativeAgentOptions = Omit<
  HarnessOptions,
  "publishWake" | "modelRequests" | "registry"
> & {
  readonly modelRequests: ModelRequestPort;
  readonly registry: Registry;
};

interface RetainedModelConnection {
  readonly connection: ModelRequestConnection;
  readonly request: ModelRequestTarget;
}

/**
 * One Pi execution owner in the existing entity/facet boundary. Product
 * definitions supply their immutable registry and protected model/operation
 * ports. No old vessel, loop driver or executor participates in this owner.
 */
export abstract class NativeAgentOwner extends PanelDurableObjectBase {
  static override schemaVersion = 4;

  private opening: Promise<Harness> | null = null;
  private harness: Harness | null = null;
  private readonly releasePhases = new Map<
    string,
    Promise<LifecyclePrepareResult>
  >();
  private sealed = false;
  private leaseRegistered = false;
  private connectionReleased = true;
  private cleanupFailure: unknown;
  private readonly modelConnections = new Set<RetainedModelConnection>();
  private readonly modelCleanupFailures = new Set<unknown>();
  private readonly native: NativeStorage;

  constructor(
    ctx: DurableObjectContext & { storage: NativeStorage },
    env: unknown,
  ) {
    super(ctx, env);
    this.native = ctx.storage;
  }

  protected abstract agentOptions(): NativeAgentOptions;

  /** Reconstruct executable product definitions before the durable Session opens. */
  protected async prepareAgentRegistry(): Promise<void> {}

  private settlementSealed = false;
  private readonly settlementOperations = new Set<Promise<unknown>>();

  /** Domain completion stays serviceable through resource release. The final
   * connection close seals and joins these admitted receipt consumers too. */
  private ownSettlement<T>(operation: () => Promise<T>): Promise<T> {
    if (this.settlementSealed)
      return Promise.reject(new Error("Pi settlement admission is sealed"));
    const pending = operation();
    this.settlementOperations.add(pending);
    const settled = () => this.settlementOperations.delete(pending);
    void pending.then(settled, settled);
    return pending;
  }

  private executionRpc: RpcClient | undefined;

  /** Native invocation effects own their authority independently of whichever
   * inbound call caused the scheduler to run. */
  protected get agentExecutionRpc(): RpcClient {
    return (this.executionRpc ??= withRpcContext(this.rpc, (operation) =>
      this.runDetached(operation),
    ));
  }

  /** Same host transport, independently authorized as this owner. Never hold
   * a request across a human decision; protected ports journal durable waits. */
  protected readonly agentRpc: RpcCaller = {
    call: (targetId, method, args, options) => this.runDetached(() =>
      this.rpc.call(targetId, method, args, mergeRpcOptions(options, { authorityAcquisition: "return" }))),
    stream: (targetId, method, args, options) => this.runDetached(() =>
      this.rpc.stream(targetId, method, args, options)),
  };

  /**
   * The product composition owns its domain resources (eval scopes, children,
   * channel membership, provider resources and publications). It must persist
   * terminal cancellation when requested and join authoritative cleanup before
   * returning. A Session close alone cannot prove those domains were released.
   * Failed attempts must remain inspectable and safely repeatable.
   */
  protected abstract releaseAgentResources(
    input: LifecyclePrepareInput,
    harness: Harness,
  ): Promise<void>;

  protected override beginLifecycleRelease(input: LifecyclePrepareInput): void {
    super.beginLifecycleRelease(input);
    if (input.phase === "quiesce") this.sealed = true;
  }

  protected override async cancelLifecyclePreparation(input: LifecyclePrepareInput): Promise<void> {
    await super.cancelLifecyclePreparation(input);
    this.settlementSealed = false;
    this.sealed = false;
  }

  /** Failed cleanup retains the exact connection and request for the domain owner. */
  protected retainedModelConnections(): readonly RetainedModelConnection[] {
    return [...this.modelConnections];
  }

  /** Retain a protected model RPC acquisition on the already running task's transaction. */
  protected waitForAgentAuthority(
    request: ModelRequestTarget,
    api: ModelRequestApi,
    info: AcquisitionInfo,
    invocation: AuthorityInvocation,
    context: Context,
  ): Promise<ModelRequestWait> {
    if (!this.harness || this.sealed)
      throw new Error(
        "Authority admission requires this owner's active Session",
      );
    return bindAuthorityAcquisition(
      this.harness,
      api,
      request,
      info,
      invocation,
      this.loadedImage(),
      this.callAgentHost,
      context,
    );
  }

  private ownedModelRequests(port: ModelRequestPort): ModelRequestPort {
    return async (request, api, context) => {
      if (this.sealed) {
        if (request.operation !== "cancelDeferred")
          throw new Error("Pi activation is sealed for lifecycle release");
        // Admission is closed, while the real abort handler still owns its
        // original deferred provider operation and the capability to retire it.
        await api.commit(async (tx) => {
          const task = await tx.task(request.taskId);
          if (
            !task ||
            task.kind !== "pi.generation" ||
            !task.abortRequested ||
            task.state.status !== "running" ||
            task.conversationId !== request.conversationId
          )
            throw new Error(
              "Deferred cleanup requires its actual aborting native task",
            );
        }, context);
      }
      const access = await this.runDetached(async () => {
        try {
          return await port(request, api, context);
        } catch (original) {
          try {
            if (this.harness)
              await withdrawFailedModelRequestAuthorities(
                this.harness,
                api,
                request,
                this.loadedImage(),
                this.callAgentHost,
                context,
              );
          } catch (closure) {
            throw new AggregateError(
              [original, closure],
              "Model request failed and authority withdrawal failed",
              { cause: original },
            );
          }
          throw original;
        }
      });
      if (access.status === "waiting") return access;
      const retained = { connection: access, request };
      this.modelConnections.add(retained);
      let closing: Promise<void> | undefined;
      return {
        status: "ready",
        options: access.options,
        close: (closeContext) => {
          closing ??= Promise.resolve()
            .then(() => this.runDetached(() => access.close(closeContext)))
            .then(
              () => {
                this.modelConnections.delete(retained);
              },
              (error: unknown) => {
                this.modelCleanupFailures.add(error);
                this.sealed = true;
                throw error;
              },
            );
          return closing;
        },
      };
    };
  }

  /** Product resources use this same activation admission barrier. */
  protected assertNativeAgentAdmission(): void {
    if (this.sealed || !this.harness)
      throw new Error("Pi activation is sealed for new product work");
  }

  /** Already-open settlement access remains valid while new admission is sealed. */
  /** Passive inspection observes this activation without admitting an execution owner. */
  protected existingAgentSession(): Harness | null {
    return this.connectionReleased ? null : this.harness;
  }

  protected admittedAgentSession(): Harness {
    if (!this.harness || this.connectionReleased)
      throw new Error("Pi owner has no open admitted Session");
    return this.harness;
  }

  /** Product tables join the same composed native schema transaction. */
  protected createAgentTables(): void | Promise<void> {}

  protected override schemaTables(): undefined {
    return undefined;
  }

  protected override requiredTables(): readonly string[] {
    return [
      "state",
      "durable_schema",
      "durable_metadata",
      "record_ids",
      "conversations",
      "entries",
      "tasks",
      "submissions",
      "documents",
      "document_revisions",
      "payload_chunks",
    ];
  }

  protected override async createTables(): Promise<void> {
    await applySqliteMigrationsInTransaction(
      nativeSqliteExecutor(this.native.sql, () => {}),
    );
    await this.createAgentTables();
  }

  /** Every framework route, including alarms and hibernation, crosses this gate. */
  private tracedSchemaInitialization: Promise<void> | null = null;

  private traceOwnerStartup(phase: string, startedAt: number): void {
    console.info("[NativeAgentOwner] startup", JSON.stringify({ runtimeId: this.rpcSelfId, phase, startedAt, durationMs: Date.now() - startedAt }));
  }

  protected override initializeSchema(): Promise<void> {
    if (this.env["VIBESTUDIO_SCHEMA_PROBE"] !== true) {
      const descriptor = this.env["VIBESTUDIO_SCHEMA_DESCRIPTOR"] as
        | DurableObjectSchemaDescriptor
        | undefined;
      if (
        !descriptor ||
        typeof descriptor.freshSchemaFingerprint !== "string" ||
        descriptor.freshSchemaFingerprint.length === 0
      ) {
        return Promise.reject(
          new Error(
            "Pi owner requires its trusted loaded-image schema descriptor",
          ),
        );
      }
    }
    const startedAt = Date.now();
    const initialization = super.initializeSchema();
    if (!this.tracedSchemaInitialization) {
      this.tracedSchemaInitialization = initialization;
      void initialization.then(() => this.traceOwnerStartup("schema", startedAt), () => {
        if (this.tracedSchemaInitialization === initialization) this.tracedSchemaInitialization = null;
      });
    }
    return initialization;
  }

  protected callAgentHost: AgentHostCall = (method, args, options) =>
    createMainRpcCaller(this.agentRpc)(method, args, options);

  protected readonly agentEvalAcknowledgements =
    createNativeEvalAcknowledgements((method, args, context) =>
      createMainRpcCaller(this.agentRpc)(method, args, { signal: context.abortSignal }),
    );

  protected loadedImage(): LoadedAgentImage {
    const source = this.env["WORKER_SOURCE"];
    const className = this.env["WORKER_CLASS_NAME"];
    const executionDigest = this.env["WORKER_EXECUTION_DIGEST"];
    if (
      typeof source !== "string" ||
      typeof className !== "string" ||
      typeof executionDigest !== "string"
    ) {
      throw new Error("Pi owner requires its exact host-loaded image bindings");
    }
    return {
      runtimeId: this.rpcSelfId,
      source,
      className,
      objectKey: this.objectKey,
      executionDigest,
    };
  }

  /** Concurrent inspection/admission/wake calls share one bound connection. */
  protected async agentSession(
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<Harness> {
    if (this.sealed)
      throw new Error("Pi activation is sealed for lifecycle release");
    const harness = await this.restoreAgentSession(context);
    if (this.sealed)
      throw new Error("Pi activation is sealed for lifecycle release");
    return harness;
  }

  /** Restore this host-bound owner without admitting input or running a turn.
   * Retained peer obligations remain serviceable through the global peer barrier. */
  protected async restoreAgentSession(
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<Harness> {
    if (this.settlementSealed)
      throw new Error("Pi settlement admission is sealed");
    await this.initializeSchema();
    if (this.settlementSealed)
      throw new Error("Pi settlement admission is sealed");
    if (!this.opening) {
      this.opening = this.runDetached(() => this.openAgent());
      const flight = this.opening;
      void flight.catch(() => {
        if (
          this.opening === flight &&
          this.connectionReleased &&
          !this.cleanupFailure &&
          !this.sealed
        ) {
          this.opening = null;
        }
      });
    }
    const harness = await this.opening;
    context.abortSignal?.throwIfAborted();
    if (this.settlementSealed)
      throw new Error("Pi settlement admission is sealed");
    return harness;
  }

  private async openAgent(): Promise<Harness> {
    try {
      let phaseStartedAt = Date.now();
      await this.prepareAgentRegistry();
      this.traceOwnerStartup("registry", phaseStartedAt);
      const options = this.agentOptions();
      options.registry.install(
        defineExtension({
          name: "vibestudio.eval-acknowledgement",
          tasks: [this.agentEvalAcknowledgements.task],
        }),
      );
      if (typeof options.modelRequests !== "function") {
        throw new Error(
          "Pi product owner requires its protected model request port",
        );
      }
      phaseStartedAt = Date.now();
      const harness = await openPlatformAgentSession(
        async () => {
          // Native owner admission atomically declared this release lease.
          this.leaseRegistered = true;
          const database = new NativeDatabase(this.native);
          this.connectionReleased = false;
          try {
            // The owning schema gate already committed and validated the whole
            // store. SqliteStorage consumes that gate, never a second installer.
            const sqliteStartedAt = Date.now();
            const storage = await SqliteStorage.open(database, () => Promise.resolve());
            this.traceOwnerStartup("sqlite-open", sqliteStartedAt);
            return storage;
          } catch (error) {
            try {
              await database.close();
              this.connectionReleased = true;
            } catch (cleanupError) {
              this.cleanupFailure = cleanupError;
              throw new AggregateError(
                [error, cleanupError],
                "Pi storage open and release failed",
              );
            }
            throw error;
          }
        },
        this.loadedImage(),
        async (method, args, options) => {
          const startedAt = Date.now();
          const result = await this.callAgentHost(method, args, options);
          if (method === "workspace-state.alarmSourceRegister") this.traceOwnerStartup("owner-admission", startedAt);
          return result;
        },
        {
          ...options,
          onReport: (error) => {
            console.error("[NativeAgentOwner] native operation failure", JSON.stringify(nativeFailureDiagnostic(error)));
            options.onReport?.(error);
          },
          modelRequests: this.ownedModelRequests(options.modelRequests),
        },
        BACKGROUND_CONTEXT,
      );
      this.traceOwnerStartup("session-open", phaseStartedAt);
      this.harness = harness;
      return harness;
    } catch (error) {
      // openBoundAgentSession closes its connection before rejecting. An
      // AggregateError explicitly records failed cleanup, which cannot become
      // a successful lifecycle receipt merely by retrying a closed handle.
      if (error instanceof AggregateError) this.cleanupFailure ??= error;
      else if (!this.cleanupFailure) this.connectionReleased = true;
      throw error;
    }
  }

  /** Replay the native versioned wake after ordinary requests. The source owns
   * both runnable wakes and authoritative clears; no ambient alarm overwrites it. */
  protected override async nextAlarmAfterRequest(): Promise<undefined> {
    const harness = this.existingAgentSession();
    if (harness && !this.settlementSealed)
      await this.ownSettlement(() => harness.flushWake(BACKGROUND_CONTEXT));
    return undefined;
  }

  override async alarm() {
    const harness = await this.agentSession();
    await this.reconcileAgentAuthority();
    const schedule = await harness.runPass(BACKGROUND_CONTEXT);
    await this.reconcileAgentAuthority();
    return schedule.wakeAt === null ? null : { wakeAt: schedule.wakeAt };
  }

  /** Join canonical receipt debt after native cancellation, before retiring the owner binding. */
  protected async reconcileAgentAuthority(): Promise<void> {
    if (!this.harness) return;
    await reconcileAuthorityReceipts(
      this.harness,
      this.loadedImage(),
      this.callAgentHost,
      BACKGROUND_CONTEXT,
    );
  }

  /** A completed ordinary tool releases only its own original acquisitions. */
  protected finishAgentToolAuthority(
    api: ToolExecutionApi,
    context: Context,
  ): Promise<void> {
    return withdrawNativeToolAuthorities(
      this.admittedAgentSession(),
      api,
      this.loadedImage(),
      this.callAgentHost,
      context,
    );
  }

  /** The host joins published causality to this owner's actual native task facts. */
  @rpc({
    website: {
      kind: "closed",
      reason: "Host verification of exact native invocation provenance.",
    },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async inspectNativeInvocationSource(input: {
    taskId: number;
    invocationId: string;
  }) {
    if (this.rpcCallerId !== "main" || this.rpcCallerKind !== "server")
      throw new Error(
        "Native invocation inspection requires the verified host server",
      );
    const checked = nativeInvocationInspectionInputSchema.parse(input);
    // Provenance belongs to durable tasks, not to this activation's connection
    // cache. Restore the same host-bound Session before reading its task; the
    // bound open rejects a different owner/image and never submits new work.
    const harness = this.existingAgentSession() ?? (await this.restoreAgentSession());
    return inspectNativeInvocationSource(
      harness,
      checked,
      this.loadedImage(),
      BACKGROUND_CONTEXT,
    );
  }

  /** Authenticated host hints never supply an outcome or create a receipt binding. */
  @rpc({
    website: {
      kind: "closed",
      reason: "Host authority receipt delivery to its owning agent.",
    },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async onAuthorityChanged(
    acquisitionId: string,
  ): Promise<{ accepted: boolean }> {
    return this.ownSettlement(async () => {
      if (this.rpcCallerId !== "main" || this.rpcCallerKind !== "server")
        throw new Error(
          "Authority receipt hints require the verified host server",
        );
      authorityMethods.acquisitionReceipt.args.parse([{ acquisitionId }]);
      const harness = await this.restoreAgentSession();
      return consumeAuthorityReceipt(
        harness,
        acquisitionId,
        this.loadedImage(),
        this.callAgentHost,
        BACKGROUND_CONTEXT,
      );
    });
  }

  /**
   * Domain hints address the retained operation by its run/receipt identity.
   * Caller identity comes from host mediation; payload result/channel fields
   * grant no authority and never supply a result to the Session.
   */
  @rpc({
    website: {
      kind: "closed",
      reason: "Internal EvalDO completion delivery to its owning agent.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async onEvalComplete(payload: {
    runId: string;
  }): Promise<{ accepted: boolean }> {
    return this.ownSettlement(async () => {
      const { runId } = evalGetArgsSchema.parse({ runId: payload?.runId });
      // Existing-domain settlement remains serviceable while new admission is
      // sealed and the resource owner awaits its cleanup receipt.
      const harness = await this.restoreAgentSession();
      const route = await retainedEvalRunRoute(
        harness,
        runId,
        BACKGROUND_CONTEXT,
      );
      if (
        route.runId !== runId ||
        this.rpcCallerId !==
          evalRuntimeId(this.rpcSelfId, route.scopeKey ?? "default")
      ) {
        throw new Error(
          "Eval completion does not belong to this owner's retained operation",
        );
      }
      return consumeEvalReceipt(
        harness,
        harness,
        runId,
        this.callAgentHost,
        this.agentEvalAcknowledgements,
        BACKGROUND_CONTEXT,
      );
    });
  }

  override releaseForLifecycle(
    input: LifecyclePrepareInput,
  ): Promise<LifecyclePrepareResult> {
    const key = `${input.epoch}:${input.phase}`;
    const existing = this.releasePhases.get(key);
    if (existing) return existing;
    if (input.phase === "quiesce") this.sealed = true;
    const flight = this.runDetached(() => this.releaseAgent(input));
    this.releasePhases.set(key, flight);
    void flight.then((result) => {
      if (result.status === "failed" && this.releasePhases.get(key) === flight)
        this.releasePhases.delete(key);
    });
    return flight;
  }

  private async releaseAgent(
    input: LifecyclePrepareInput,
  ): Promise<LifecyclePrepareResult> {
    try {
      if (this.opening) await this.opening.catch(() => {});
      if (input.phase === "quiesce") return { status: "ready" };
      if (this.cleanupFailure) throw this.cleanupFailure;
      if (input.phase === "peer-obligations") {
        // A fresh activation has no connection cache; its committed execution
        // and domain obligations still belong to this exact host-bound owner.
        if (!this.opening) await this.restoreAgentSession();
        if (this.harness && !this.connectionReleased) {
          await this.releaseAgentResources(input, this.harness);
          await this.reconcileAgentAuthority();
          if (input.mode === "retire") {
            await this.drainEvalAcknowledgements(this.harness);
          }
        }
        return { status: "ready" };
      }
      this.settlementSealed = true;
      await Promise.all([...this.settlementOperations]);
      if (this.harness && !this.connectionReleased) {
        try {
          if (input.mode === "retire") await retireBoundAgentSession(this.harness, BACKGROUND_CONTEXT);
          await this.harness.close(BACKGROUND_CONTEXT);
        } catch (error) {
          this.cleanupFailure = error;
          throw error;
        }
        this.connectionReleased = true;
      }
      if (!this.connectionReleased)
        throw new Error("Pi connection release is unconfirmed");
      // Harness.close seals and joins its active invocations while preserving
      // their durable task records. Model-provider close receipts settle there;
      // inspect them before acknowledging the local lifecycle lease release.
      this.assertModelResourcesReleased();
      if (this.leaseRegistered) {
        await this.clearLifecycleRelease();
        this.leaseRegistered = false;
      }
      return { status: "ready" };
    } catch (error) {
      return {
        status: "failed",
        failure: serializeRpcFailure(error),
      };
    }
  }

  private assertModelResourcesReleased(): void {
    // Harness.close joins active invocations but leaves these receipts intact;
    // inspect them before acknowledging local lease release.
    if (this.modelCleanupFailures.size === 1)
      throw [...this.modelCleanupFailures][0];
    if (this.modelCleanupFailures.size > 1)
      throw new AggregateError(
        [...this.modelCleanupFailures],
        "Pi model resource release is unconfirmed",
      );
    if (this.modelConnections.size > 0)
      throw new Error("Pi model resource release is unconfirmed");
  }

  private async drainEvalAcknowledgements(harness: Harness): Promise<void> {
    const live = await harness.inspect(BACKGROUND_CONTEXT);
    for (const { record: task } of live.tasks) {
      if (task.kind !== this.agentEvalAcknowledgements.task.definition.name)
        continue;
      if (
        task.state.status === "waiting" &&
        task.state.condition.kind === "failure"
      )
        await harness.retryTask(
          task.id,
          task.state.condition.incident,
          BACKGROUND_CONTEXT,
        );
      await harness.abortTask(task.id, BACKGROUND_CONTEXT);
      const settled = await harness.waitForTask(task.id, BACKGROUND_CONTEXT);
      if (settled.state.outcome.status !== "completed")
        throw new Error("Eval acknowledgement debt did not settle", {
          cause: settled.state.outcome,
        });
    }
  }

  override async resumeAfterRestart(
    _input: LifecycleResumeInput,
  ): Promise<void> {
    // A released heap cannot resume. The host replaces the activation and the
    // new owner reopens committed work under its current image/incarnation.
    const harness = await this.agentSession();
    await reconcileAuthorityReceipts(
      harness,
      this.loadedImage(),
      this.callAgentHost,
      BACKGROUND_CONTEXT,
    );
    await harness.flushWake(BACKGROUND_CONTEXT);
  }
}
