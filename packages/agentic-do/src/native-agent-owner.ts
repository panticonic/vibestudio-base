import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import type { Context, JsonValue } from "@panticonic/pi-chord";
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
  type Cursor,
  type TaskId,
} from "@panticonic/pi-durable";
import {
  applySqliteMigrationsInTransaction,
  nativeSqliteExecutor,
  NativeDatabase,
  type NativeStorage,
  SqliteStorage,
} from "@panticonic/pi-durable/storage/sqlite";
import type { DurableObjectSchemaDescriptor } from "@vibestudio/durable/schema";
import {
  rpc,
  serializeRpcFailure,
  withRpcContext,
  type RpcClient,
  type AcquisitionInfo,
  type RpcCaller,
} from "@vibestudio/rpc";
import { mergeRpcOptions } from "@vibestudio/rpc/internal";
import { evalRuntimeId } from "@vibestudio/shared/evalRuntimeIdentity";
import { evalOwnerCallbackMethods } from "@vibestudio/service-schemas/eval";
import { authorityMethods } from "@vibestudio/service-schemas/authority";
import { nativeInvocationInspectionInputSchema, nativeInvocationSourceSchema, nativeInvocationId } from "@vibestudio/service-schemas/nativeInvocation";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { stableSha256Hex } from "@vibestudio/content-addressing";
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

const NATIVE_SOURCE_LAYOUT_KEY = "vibestudio.native-invocation-source.layout";
const NATIVE_SOURCE_LAYOUT_VERSION = 2;

/**
 * One Pi execution owner in the existing entity/facet boundary. Product
 * definitions supply their immutable registry and protected model/operation
 * ports. No old vessel, loop driver or executor participates in this owner.
 */
export abstract class NativeAgentOwner extends PanelDurableObjectBase {
  static override schemaVersion = 5;
  static override nativeOwner = true;

  private opening: Promise<Harness> | null = null;
  private harness: Harness | null = null;
  private readonly releasePhases = new Map<
    string,
    Promise<LifecyclePrepareResult>
  >();
  private sealed = false;
  private connectionReleased = true;
  private cleanupFailure: unknown;
  private sessionFailure: { readonly error: unknown } | undefined;
  private sessionClosure: Promise<void> | null = null;
  private sessionClosing = false;
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
    if (this.sessionFailure) throw this.sessionFailure.error;
    if (this.sealed || !this.harness)
      throw new Error("Pi activation is sealed for new product work");
  }

  /** Already-open settlement access remains valid while new admission is sealed. */
  /** Passive inspection observes this activation without admitting an execution owner. */
  protected existingAgentSession(): Harness | null {
    return this.connectionReleased ? null : this.harness;
  }

  protected admittedAgentSession(): Harness {
    if (this.sessionFailure) throw this.sessionFailure.error;
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

  /** Data layout belongs to this owner, separately from Pi's upstream schema
   * ledger and each product's structural schema version. */
  private migrateNativeSourceLayout(): Promise<void> {
    return this.native.transaction(async () => {
      const row = this.native.sql.exec(
        "SELECT value FROM state WHERE key = ?", NATIVE_SOURCE_LAYOUT_KEY,
      ).toArray()[0];
      const version = row ? JSON.parse(String(row["value"])) : 1;
      if (version === NATIVE_SOURCE_LAYOUT_VERSION) return;
      if (version !== 1)
        throw new Error(`Unsupported native invocation source layout ${version}`);
      await this.restoreRetiredNativeSources();
      // Document metadata contains a hashed invocation key, fixed kind, IDs,
      // and scope, so its revision-zero record fits one Pi payload chunk.
      // Content revisions, source bytes, IDs and sequence history are untouched.
      this.native.sql.exec(`UPDATE payload_chunks SET
        data = CAST(json_set(CAST(data AS TEXT), '$.scope', json('{"kind":"session"}')) AS BLOB),
        byte_length = length(CAST(json_set(CAST(data AS TEXT), '$.scope', json('{"kind":"session"}')) AS BLOB))
       WHERE revision = 0 AND id IN (
         SELECT id FROM documents
         WHERE kind = '"vibestudio.native-invocation-source"' AND scope_kind = 'task'
       )`).toArray();
      this.native.sql.exec(`UPDATE documents SET scope_kind = 'session', owner_id = 0
        WHERE kind = '"vibestudio.native-invocation-source"' AND scope_kind = 'task'`).toArray();
      this.native.sql.exec(
        "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
        NATIVE_SOURCE_LAYOUT_KEY, JSON.stringify(NATIVE_SOURCE_LAYOUT_VERSION),
      ).toArray();
    });
  }

  /** Old task retirement removed source content. Recover only the original
   * source already retained by the trusted invocation publication journal. */
  private async restoreRetiredNativeSources(): Promise<void> {
    const retired = this.native.sql.exec(`SELECT id, key_value, owner_id, created_at FROM documents
      WHERE kind = '"vibestudio.native-invocation-source"' AND scope_kind = 'task' AND retired_at IS NOT NULL`).toArray();
    if (!retired.length) return;
    const needed = new Map(retired.map((row) => [JSON.parse(String(row["key_value"])) as string, row]));
    // Before model targets became part of native identity, the admitted model
    // source contained only purpose/attempt/cutoff/requestDigest. Preserve that
    // historical archive exactly; migration does not invent target fields or
    // broaden the live source schema.
    const archivedSourceSchema = nativeInvocationSourceSchema.or(
      nativeInvocationSourceSchema.extend({
        operation: nativeInvocationSourceSchema.shape.operation.options[3].omit({
          providerId: true, modelId: true, endpoint: true,
        }),
      }),
    );
    const sources = new Map<string, ReturnType<typeof archivedSourceSchema.parse>>();
    // This read-only portable connection uses Pi's canonical chunk decoder.
    // It creates no Session or execution owner, and its reads share the outer
    // native data-migration transaction.
    const storage = await SqliteStorage.open(new NativeDatabase(this.native), () => Promise.resolve());
    try {
      let cursor: Cursor | undefined;
      do {
        const page = await storage.scanTasks({ kind: "vibestudio.channel-publication" }, 32, cursor, BACKGROUND_CONTEXT);
        for (const publication of page.items) {
          const input = publication.input as unknown as {
            terminal?: { source?: JsonValue; start?: { causality?: { invocationId?: string } } };
            events?: { event?: { causality?: { invocationId?: string }; payload?: { nativeSource?: JsonValue } } }[];
          };
          const candidates = [
            { invocationId: input.terminal?.start?.causality?.invocationId, source: input.terminal?.source },
            ...(Array.isArray(input.events) ? input.events : []).map(({ event }) => ({
              invocationId: event?.causality?.invocationId, source: event?.payload?.nativeSource,
            })),
          ];
          for (const candidate of candidates) {
            if (!candidate.invocationId || !needed.has(candidate.invocationId)) continue;
            const source = archivedSourceSchema.parse(candidate.source);
            const id = source.operation.kind === "model" && !("providerId" in source.operation)
              ? `invocation:native:${stableSha256Hex([
                  "vibestudio/native-invocation/v1", source.owner.runtimeId,
                  source.owner.authoritySessionId, source.task.conversationId, source.task.taskId,
                  ["model", source.operation.purpose, source.operation.attempt, source.operation.cutoff],
                ])}`
              : nativeInvocationId(nativeInvocationSourceSchema.parse(source));
            if (id !== candidate.invocationId)
              throw new Error("Legacy native source publication conflicts with its invocation identity");
            const document = needed.get(id)!;
            const original = await storage.task(source.task.taskId as TaskId, BACKGROUND_CONTEXT);
            const image = this.loadedImage();
            if (!original || source.task.taskId !== document["owner_id"] ||
              source.task.conversationId !== original.conversationId ||
              source.task.kind !== original.kind || source.task.version !== original.version ||
              publication.conversationId !== original.conversationId ||
              source.owner.runtimeId !== image.runtimeId || source.owner.source !== image.source ||
              source.owner.className !== image.className || source.owner.objectKey !== image.objectKey)
              throw new Error("Legacy native source publication conflicts with its actual task or owner");
            const prior = sources.get(id);
            if (prior && canonicalJson(prior) !== canonicalJson(source))
              throw new Error("Legacy native source has contradictory original publications");
            sources.set(id, source);
          }
        }
        cursor = page.next;
      } while (cursor);
      for (const [invocationId, source] of sources) {
        const document = needed.get(invocationId)!;
        const documentId = Number(document["id"]);
        const revision = Number(document["created_at"]);
        const bytes = new TextEncoder().encode(JSON.stringify({ source }));
        this.native.sql.exec("INSERT INTO document_revisions (document_id, seq, kind, version) VALUES (?, ?, 'base', 1)", documentId, revision).toArray();
        // Pi's SQLite wire format caps each payload chunk at 512 KiB.
        for (let offset = 0, ordinal = 0; offset < bytes.length; offset += 512 * 1024, ordinal++) {
          const data = bytes.slice(offset, offset + 512 * 1024);
          this.native.sql.exec("INSERT INTO payload_chunks (id, revision, ordinal, byte_length, data) VALUES (?, ?, ?, ?, ?)",
            documentId, revision, ordinal, bytes.length, data.buffer).toArray();
        }
        this.native.sql.exec(`UPDATE payload_chunks SET
          data = CAST(json_remove(CAST(data AS TEXT), '$.retiredAt') AS BLOB),
          byte_length = length(CAST(json_remove(CAST(data AS TEXT), '$.retiredAt') AS BLOB))
          WHERE id = ? AND revision = 0`, documentId).toArray();
        this.native.sql.exec("UPDATE documents SET retired_at = NULL WHERE id = ?", documentId).toArray();
      }
    } finally {
      await storage.close(BACKGROUND_CONTEXT);
    }
  }

  protected override initializeSchema(): Promise<void> {
    if (this.tracedSchemaInitialization) return this.tracedSchemaInitialization;
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
    const initialization = super.initializeSchema().then(() => this.migrateNativeSourceLayout());
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
    if (this.sessionFailure) throw this.sessionFailure.error;
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
        this.ctx.props.nativeOwner,
        this.callAgentHost,
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
      this.sessionClosing = false;
      harness.subscribeClose(() => { this.sessionClosing = true; });
      // Session failure is authoritative. Join the real provider/backend close
      // before recording a released connection; a later lifecycle epoch may
      // restore retained obligations, while product admission keeps the cause.
      this.sessionClosure = harness.closed.then(async (end) => {
        if (end.reason === "failed") this.sessionFailure ??= { error: end.error };
        try {
          await harness.close(BACKGROUND_CONTEXT);
          this.assertModelResourcesReleased();
          if (this.harness === harness) this.connectionReleased = true;
        } catch (error) {
          this.cleanupFailure ??= end.reason === "failed" && error !== end.error
            ? new AggregateError([end.error, error], "Pi session failure and resource release failed")
            : error;
        }
      });
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
      const [{ runId }] = evalOwnerCallbackMethods.onEvalComplete.args.parse([
        payload,
      ]);
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
    if (input.phase === "quiesce") {
      this.sealed = true;
      // A new lifecycle epoch may own a dormant native obligation after a
      // previous suspend released its connection. Only settlement reopens;
      // product/model admission remains sealed throughout the peer barrier.
      if (!this.opening && this.connectionReleased && !this.cleanupFailure)
        this.settlementSealed = false;
    }
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
      if (input.phase === "quiesce") {
        if (this.sessionClosing && this.sessionClosure) {
          await this.sessionClosure;
          if (this.cleanupFailure) throw this.cleanupFailure;
          if (this.sessionFailure) {
            this.harness = null;
            this.opening = null;
            this.settlementSealed = false;
          }
        }
        return { status: "ready" };
      }
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
      // inspect them before acknowledging the lifecycle epoch release.
      this.assertModelResourcesReleased();
      // Native resource ownership belongs to the active entity, including
      // hibernated connections. The lifecycle epoch receipt confirms this
      // connection was joined; retirement clears the obligation on the host.
      this.harness = null;
      this.opening = null;
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
    // inspect them before acknowledging the lifecycle epoch release.
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
