import { LifecyclePreparation } from "@vibestudio/shared/lifecyclePreparation";
import { serializeRpcFailure, deserializeRpcFailure } from "@vibestudio/rpc";
import { createTypedRpcServiceClient } from "@vibestudio/shared/typedRpcServiceClient";
/**
 * DurableObjectBase — Tiny generic foundation for all Durable Objects.
 *
 * Only what every DO needs: context, SQL, schema versioning, state KV,
 * alarm support, HTTP dispatch, WebSocket upgrade stub, and hibernation hooks.
 *
 * Agent-specific concerns (harnesses, turns, subscriptions, streams) live
 * in @workspace/agentic-do — composable modules that extend this base.
 */

import { type MethodSchema, type ServiceMethodSchemas, type TypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { parseLifecyclePrepareInput } from "@vibestudio/shared/doDispatcher";
import { runtimeMethods } from "@vibestudio/service-schemas/runtime";
import { workspaceStateMethods } from "@vibestudio/service-schemas/workspaceState";
import { canonicalJson } from "@vibestudio/content-addressing";
import type {
  DoAlarmSchedule,
  LifecyclePrepareInput,
  LifecyclePrepareResult,
  LifecycleResumeInput,
  LifecycleCloneInput,
} from "@vibestudio/shared/doDispatcher";
export type {
  LifecyclePrepareInput,
  LifecyclePrepareResult,
  LifecycleResumeInput,
  LifecycleCloneInput,
} from "@vibestudio/shared/doDispatcher";
import { collectExposableMethods, decodeRpcJson, encodeRpcJson, envelopeFromMessage, rpcExposedMethodNames, rpcMethodAuthority, rpc, type RpcClient, type RpcEnvelope, type RpcEvent, type RpcRequest, responseEnvelopeFor, type RpcRequestContext, type ResolvedRpcAuthority, type WebsiteMethodPolicy } from "@vibestudio/rpc";
import type { AuthorizationContext } from "@vibestudio/rpc";
import {
  DurableDirectRpcNonceLedger,
  directRpcInvalidAttestationFailure,
  directRpcDenial,
  directRpcInvocationResourceKey,
  eventIntakeAuthority,
  hostControlDenial,
  type DirectRpcDenial,
  type EventIntakeRule,
  type HostControlDenial,
} from "@vibestudio/shared/directRpcEnforcement";
import {
  createCredentialClient,
  type CredentialClient,
} from "../shared/credentials.js";
import {
  createNotificationClient,
  type NotificationClient,
} from "../shared/notifications.js";
import { createRpcFs } from "../shared/rpcFs.js";
import {
  createBlobstoreClient,
  type BlobstoreClient,
} from "../shared/blobstore.js";
import type { AuthenticatedCaller } from "@vibestudio/rpc";
import {
  DIRECT_AUTHORITY_ACCEPTED_AT_HEADER,
  createCausalRpcOperationTracker,
  createInternalConnectionlessRpcClient,
  type InternalConnectionlessRpcClient,
  schemaRpcClient,
  type AttestedCaller,
} from "@vibestudio/rpc/internal";
import type { RuntimeFs } from "../types.js";
import {
  assertChannelDeliverySource,
  ResidentSessionRegistry,
  type ResidentChannelDeliveryInput,
  type ResidentChannelInvocationInput,
  type ResidentChannelCancellationInput,
  type ResidentSessionReceiver,
} from "@vibestudio/shared/residentSession";
import {
  bindMethodCapability,
  allOf,
  anyOf,
  capability,
} from "@vibestudio/shared/authorization";
import {
  type DurableWorkQueue,
  type DurableWorkReleaseReceipt,
  DurableWorkReleaseStage,
} from "@vibestudio/shared/durableWork";
import {
  dispatchWithDurableObjectSchemaGuard,
  durableObjectExecutableDescriptor,
  validateDurableObjectExecutableCapabilities,
  installDurableObjectSchema,
  type DurableObjectExecutableDescriptor,
  type DurableObjectSchemaUpgrade,
  validateDurableObjectSchemaIndexes,
} from "@vibestudio/durable/schema";
import { DurableWorkReadiness, InvocationContext } from "@vibestudio/durable";

interface RpcInvocationContext {
  requestSignal?: AbortSignal;
  verifiedCaller: AttestedCaller | null;
  /** False once the inbound invocation has returned, even though
   * AsyncLocalStorage may still be present in deferred work it spawned. */
  authorityActive: boolean;
  callerId: string | null;
  callerKind: string | null;
  callerPanelId: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
  readyQueues: Set<DurableWorkQueue>;
  alarmRpcs?: Set<Promise<void>>;
}

function directAuthorityAcceptedAt(request: Request): number {
  const raw = request.headers.get(DIRECT_AUTHORITY_ACCEPTED_AT_HEADER);
  if (raw !== null) {
    const acceptedAt = Number(raw);
    if (Number.isFinite(acceptedAt) && acceptedAt > 0) return acceptedAt;
  }
  // Direct unit harnesses do not run through the authenticated workerd router;
  // retaining receipt-time evaluation keeps that path strictly shorter-lived.
  return Date.now();
}

// Minimal types for workerd DurableObject context (cannot import cloudflare:workers in Node)

export interface DurableObjectContext {
  id: { toString(): string; name?: string };
  storage: {
    sql: SqlStorage;
    setAlarm(scheduledTime: number | Date): void;
    getAlarm(): Promise<number | null>;
    deleteAlarm(): void;
    /**
     * Run a synchronous block inside a DO storage transaction. Workerd
     * rejects raw `BEGIN`/`COMMIT` SQL and requires this API instead — it
     * auto-rolls-back on thrown exceptions and coalesces with the DO's
     * atomic-write semantics. The callback must be synchronous.
     */
    transactionSync<T>(callback: () => T): T;
    transaction<T>(callback: () => Promise<T>): Promise<T>;
    /** Join native storage durability before releasing an owned connection. */
    sync(): Promise<void>;
  };
  // Tagged accept: tags survive hibernation, retrievable via getWebSockets(tag)
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  // Retrieve by tag, or all if no tag
  getWebSockets(tag?: string): WebSocket[];
  // Run async init during construction or upgrade (blocks other events)
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  // Keep background work alive after an RPC/fetch handler returns.
  waitUntil?(promise: Promise<unknown>): void;
}

export interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): SqlResult;
}

export interface SqlResult {
  toArray(): Record<string, unknown>[];
  one(): Record<string, unknown>;
}

/** Typed authoring facade over the raw workerd SQL cursor. */
export interface TypedSqlStorage {
  exec<Row extends object = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): {
    toArray(): Row[];
    one(): Row;
    /** Native workerd cursor accounting; values advance as the cursor is consumed. */
    readonly columnNames: string[];
    readonly rowsRead: number;
    readonly rowsWritten: number;
  };
}

export interface DORef {
  source: string;
  className: string;
  objectKey: string;
}

// (RPC exposure is now opt-in via `@rpc` + `rpcExposedMethodNames` — no reserved deny-list needed;
// framework/lifecycle methods are simply never `@rpc`-marked, and the base-proto boundary backstops.)

export abstract class DurableObjectBase {
  private readonly lifecyclePreparation = new LifecyclePreparation();
  protected ctx: DurableObjectContext;
  protected sql: TypedSqlStorage;
  protected env: Record<string, unknown>;

  private readonly residentSessions = new ResidentSessionRegistry();
  private _schemaReady = false;
  private schemaInitialization: Promise<void> | null = null;
  private schemaActivationTiming: {
    startedAt: number;
    durationMs: number;
  } | null = null;

  private _connectionless: InternalConnectionlessRpcClient | null = null;
  private readonly _directRpcNonces: DurableDirectRpcNonceLedger;
  protected _currentRpcCallerId: string | null = null;
  protected _currentRpcCallerKind: string | null = null;
  protected _currentRpcCallerPanelId: string | null = null;
  protected _currentRpcRequestId: string | null = null;
  protected _currentRpcIdempotencyKey: string | null = null;
  private _currentVerifiedCaller: AttestedCaller | null = null;
  private readonly _invocationContext =
    new InvocationContext<RpcInvocationContext>();
  private readonly _causalRpcOperations = createCausalRpcOperationTracker(
    () => this.activeInvocationContext ?? undefined,
  );
  private _credentials: CredentialClient | null = null;
  private _notifications: NotificationClient | null = null;
  private _fs: RuntimeFs | null = null;
  private _blobstore: BlobstoreClient | null = null;
  private readonly _durableWorkReadiness: DurableWorkReadiness;

  constructor(ctx: DurableObjectContext, env: unknown) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql as TypedSqlStorage;
    this._directRpcNonces = new DurableDirectRpcNonceLedger({
      exec: (query, ...bindings) => this.sql.exec(query, ...bindings),
      transactionSync: (callback) => this.ctx.storage.transactionSync(callback),
    });
    this.env = env as Record<string, unknown>;
    this._durableWorkReadiness = new DurableWorkReadiness(
      {
        get: (key) => this.getStateValue(key),
        set: (key, value) => this.setStateValue(key, value),
        transaction: (callback) => this.ctx.storage.transactionSync(callback),
      },
      crypto.randomUUID(),
    );
    // Schema is NOT initialized here — deferred to first fetch()/alarm().
    // This avoids the init-order bug where createTables() would be called
    // during super() before subclass fields are initialized.
  }

  // --- Schema (lazy init, enforced automatically) ---

  static schemaVersion = 1;
  static readonly durableWorkQueues: readonly DurableWorkQueue[] = [];
  static eventIntake: readonly EventIntakeRule[] = [];
  static rpcMethods?: ServiceMethodSchemas;

  /** Subclasses define their SQL tables here. Called during schema init. */
  protected abstract createTables(): void | Promise<void>;

  /** Restore activation-local state synchronously after schema admission.
   * Network setup and resource acquisition belong to their owning operation. */
  protected restoreActivationState(): undefined {}

  protected rpcSchemaCodeSource(
    _method: string,
    _wireMethod: MethodSchema,
  ): string | null {
    return null;
  }

  protected rpcAuthorityDeclaration(
    method: string,
    wireMethod: MethodSchema | undefined,
  ): ResolvedRpcAuthority | null {
    if (!wireMethod) return rpcMethodAuthority(this, method) ?? null;
    const authority = wireMethod.authority;
    const tier = wireMethod.tier;
    const sensitivity = wireMethod.access?.sensitivity;
    const methodCapability = wireMethod.capability;
    if (!authority || !tier || !sensitivity) {
      throw new Error(
        `${this.constructor.name}.${method} has an incomplete typed receiver authority declaration`,
      );
    }
    const effect = wireMethod.directEffect;
    if (!effect && !methodCapability) {
      throw new Error(
        `${this.constructor.name}.${method} has an incomplete typed receiver authority declaration`,
      );
    }
    const resolvedEffect =
      effect ??
      ({
        kind: "host-capability" as const,
        capability: methodCapability!,
        resource: { kind: "receiver-object" as const },
      } as const);
    if (!("principals" in authority)) {
      if (!methodCapability) {
        throw new Error(
          `${this.constructor.name}.${method} has an incomplete typed receiver authority declaration`,
        );
      }
      if (authority.additional?.length || authority.prepared) {
        throw new Error(
          `${this.constructor.name}.${method} uses host-service-only prepared authority`,
        );
      }
      return {
        requires: bindMethodCapability(authority.requirement, methodCapability),
        website: wireMethod.website,
        effect: resolvedEffect,
        tier: tier.tier,
        sensitivity,
        ...(tier.session === "codeOnly" ? { codeOnly: true } : {}),
        ...(wireMethod.crossWorkspace === true ? { crossWorkspace: true } : {}),
      };
    }
    const codeSource = this.rpcSchemaCodeSource(method, wireMethod);
    if (!codeSource || !authority.principals.includes("code")) {
      return {
        principals: authority.principals,
        website: wireMethod.website,
        effect: resolvedEffect,
        tier: tier.tier,
        sensitivity,
        ...(tier.session === "codeOnly" ? { codeOnly: true } : {}),
        ...(wireMethod.crossWorkspace === true ? { crossWorkspace: true } : {}),
      };
    }
    const unconstrained = authority.principals.filter(
      (principal) => principal !== "code",
    );
    if (!methodCapability) {
      throw new Error(
        `${this.constructor.name}.${method} has an incomplete typed receiver authority declaration`,
      );
    }
    return {
      requires: anyOf(
        ...unconstrained.map((principal) =>
          capability(principal, methodCapability),
        ),
        allOf(capability("code", methodCapability), {
          kind: "relationship",
          name: "code-source",
          value: codeSource,
        }),
      ),
      website: wireMethod.website,
      effect: resolvedEffect,
      tier: tier.tier,
      sensitivity,
      ...(tier.session === "codeOnly" ? { codeOnly: true } : {}),
      ...(wireMethod.crossWorkspace === true ? { crossWorkspace: true } : {}),
    };
  }

  /** Tables that must exist before a schema version is recorded as ready. */
  protected requiredTables(): readonly string[] {
    return [];
  }

  /** Components name owned tables; a complete composition owns the whole store. */
  protected schemaTables(): readonly string[] | undefined {
    return this.requiredTables();
  }

  protected schemaIndexDefinitions(): readonly string[] | undefined {
    return undefined;
  }

  protected validateSchema(): void {
    const requiredTables = this.requiredTables();
    const existingTables = new Set(
      requiredTables.length
        ? this.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table'`)
            .toArray().map((row) => String(row["name"]))
        : [],
    );
    const missing = requiredTables.filter((table) => !existingTables.has(table));
    if (missing.length > 0) {
      throw new Error(
        `${this.constructor.name} schema validation failed: missing table(s): ${missing.join(", ")}`,
      );
    }
    const indexes = this.schemaIndexDefinitions();
    if (indexes)
      validateDurableObjectSchemaIndexes(
        this.sql,
        requiredTables,
        indexes,
      );
  }

  /**
   * Lazily called on first fetch() or alarm(). Safe for subclasses to call
   * earlier from their constructor if they need schema before first request.
   */
  /** Synchronous helpers require admission through the asynchronous ready gate. */
  protected ensureReady(): void {
    if (!this._schemaReady)
      throw new Error(
        "Schema initialization must finish before accessing durable state",
      );
  }

  /** One shared initialization promise per activation; failed attempts can retry. */
  protected initializeSchema(): Promise<void> {
    if (this._schemaReady) return Promise.resolve();
    if (this.schemaInitialization) return this.schemaInitialization;
    const startedAt = Date.now();
    const initialization = (async () => {
      await this.ensureSchema();
      if (this.env["VIBESTUDIO_SCHEMA_PROBE"] !== true)
        this.restoreActivationState();
      this._schemaReady = true;
      this.schemaActivationTiming = {
        startedAt,
        durationMs: Math.max(0, Date.now() - startedAt),
      };
    })();
    this.schemaInitialization = initialization;
    void initialization
      .finally(() => {
        if (this.schemaInitialization === initialization)
          this.schemaInitialization = null;
      })
      .catch(() => {});
    return initialization;
  }

  /** The completed schema gate for this activation, without another state read. */
  protected get activationSchemaTiming(): Readonly<{
    startedAt: number;
    durationMs: number;
  }> | null {
    return this.schemaActivationTiming;
  }

  protected schemaUpgrades(): readonly DurableObjectSchemaUpgrade[] {
    return [];
  }

  private async ensureSchema(): Promise<void> {
    const descriptor = this.env["VIBESTUDIO_SCHEMA_DESCRIPTOR"] as
      | DurableObjectExecutableDescriptor
      | undefined;
    const version = (this.constructor as typeof DurableObjectBase)
      .schemaVersion;
    if (
      descriptor &&
      (descriptor.className !==
        String(this.env["WORKER_CLASS_NAME"] ?? this.constructor.name) ||
        descriptor.version !== version ||
        typeof descriptor.freshSchemaFingerprint !== "string")
    ) {
      throw new Error(
        "Schema descriptor does not match the admitted runtime image",
      );
    }
    if (descriptor) validateDurableObjectExecutableCapabilities(
      descriptor, (this.constructor as typeof DurableObjectBase).durableWorkQueues
    );
    await installDurableObjectSchema({
      className: String(this.env["WORKER_CLASS_NAME"] ?? this.constructor.name),
      version,
      storage: this.ctx.storage,
      schemaTables: this.schemaTables(),
      expectedFingerprint: descriptor?.freshSchemaFingerprint,
      upgrades: this.schemaUpgrades(),
      createSchema: () => this.createTables(),
      validateSchema: () => this.validateSchema(),
    });
  }

  private schemaDescriptorResponse(): Response {
    return Response.json(
      durableObjectExecutableDescriptor({
        className: String(
          this.env["WORKER_CLASS_NAME"] ?? this.constructor.name,
        ),
        version: (this.constructor as typeof DurableObjectBase).schemaVersion,
        storage: this.ctx.storage,
        schemaTables: this.schemaTables(),
        createSchema: () => this.createTables(),
        validateSchema: () => this.validateSchema(),
      }, (this.constructor as typeof DurableObjectBase).durableWorkQueues),
    );
  }

  // --- State KV (generic, always available) ---

  protected getStateValue(key: string): string | null {
    const row = this.sql
      .exec(`SELECT value FROM state WHERE key = ?`, key)
      .toArray();
    return row.length > 0 ? (row[0]!["value"] as string) : null;
  }

  protected setStateValue(key: string, value: string): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)`,
      key,
      value,
    );
  }

  protected deleteStateValue(key: string): void {
    this.sql.exec(`DELETE FROM state WHERE key = ?`, key);
  }

  // Authority continuation belongs to each caller's domain outbox. The runtime
  // base intentionally exposes only ordinary RPC; it stores no generic
  // continuations or host-process callbacks.

  /** Parse a POST body into positional method arguments. */
  private parseRequestBody(body: string): {
    args: unknown[];
    error?: string;
    caller?: AttestedCaller | null;
  } {
    const parsed = decodeRpcJson(body);
    const dispatchArgs: unknown =
      parsed && typeof parsed === "object"
        ? (parsed as { args?: unknown }).args
        : undefined;
    if (Array.isArray(parsed)) {
      return { args: parsed };
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      ("__instanceToken" in parsed || "__instanceId" in parsed) &&
      Array.isArray(dispatchArgs)
    ) {
      const caller = (parsed as { __caller?: unknown }).__caller;
      if (caller && typeof caller === "object") {
        const record = caller as Record<string, unknown>;
        if (
          typeof record["callerId"] === "string" &&
          typeof record["callerKind"] === "string"
        ) {
          return {
            args: dispatchArgs,
            caller: {
              callerId: record["callerId"],
              callerKind: record[
                "callerKind"
              ] as AuthenticatedCaller["callerKind"],
              ...(typeof record["callerPanelId"] === "string"
                ? { callerPanelId: record["callerPanelId"] }
                : {}),
              ...(typeof record["userId"] === "string"
                ? { userId: record["userId"] }
                : {}),
              ...(typeof record["workspaceId"] === "string"
                ? { workspaceId: record["workspaceId"] }
                : {}),
              ...(record["authorization"] &&
              typeof record["authorization"] === "object"
                ? {
                    authorization: record[
                      "authorization"
                    ] as AttestedCaller["authorization"],
                  }
                : {}),
            } as AttestedCaller,
          };
        }
      }
      return {
        args: dispatchArgs,
      };
    }
    return { args: [parsed] };
  }

  // --- RPC bridge + shared clients (lazy) ---

  /**
   * RPC bridge — the unified connectionless `createRpcClient` core (envelope
   * transport). The DO's public methods are `exposeAll`'d onto
   * it so inbound request envelopes dispatch to the class method via the shared
   * `handleEnvelope`; `respond`/`deliver` are wired in `fetch`.
   */
  protected get rpc(): RpcClient {
    return schemaRpcClient(this.connectionlessClient().client);
  }

  /** Activation-owned work has its own lifetime and cannot borrow an inbound
   * caller's transient authority. Guest effects need separately admitted facts. */
  protected runDetached<R>(operation: () => R): R {
    return this._invocationContext.runDetached(operation);
  }

  private connectionlessClient(): InternalConnectionlessRpcClient {
    if (!this._connectionless) {
      const token = this.env["RPC_AUTH_TOKEN"];
      if (typeof token !== "string" || token.length === 0) {
        throw new Error("RPC not available: RPC_AUTH_TOKEN not configured");
      }
      const source = this.env["WORKER_SOURCE"];
      const className = this.env["WORKER_CLASS_NAME"];
      if (typeof source !== "string" || source.length === 0) {
        throw new Error("RPC not available: WORKER_SOURCE not configured");
      }
      if (typeof className !== "string" || className.length === 0) {
        throw new Error("RPC not available: WORKER_CLASS_NAME not configured");
      }
      const serverUrl = this.env["GATEWAY_URL"] as string;
      if (!serverUrl) {
        throw new Error("RPC not available: GATEWAY_URL not configured");
      }
      const workspaceId = this.env["WORKSPACE_ID"];
      if (typeof workspaceId !== "string" || !workspaceId)
        throw new Error("RPC not available: WORKSPACE_ID not configured");
      const connectionless = createInternalConnectionlessRpcClient({
        selfId: `do:${source}:${className}:${this.objectKey}`,
        serverUrl,
        authToken: token,
        callerKind: "do",
        workspaceId,
        // Continue only the currently executing host-attested invocation.
        // The callback is evaluated per outbound envelope; once inbound
        // dispatch restores its caller, alarms and later work carry no nonce.
        authorityParentNonce: () =>
          this.activeInvocationContext?.verifiedCaller?.authorization?.nonce,
        invocationSignal: () => this.activeInvocationContext?.requestSignal,
        onOutboundOperation: this._causalRpcOperations.observe,
      });
      // Expose ONLY this DO's `@rpc`-marked methods (opt-in / default-deny). Private/protected helpers
      // and all framework plumbing (`dispatchInboundEnvelope`, state KV, panel/alarm helpers) are
      // unreachable over the open relay; a forgotten `@rpc` fails loud ("not exposed").
      const exposedHandlers = Object.fromEntries(
        Object.entries(
          collectExposableMethods(
            this,
            rpcExposedMethodNames(this),
            Object.prototype,
          ),
        ).map(([name, handler]) => [
          name,
          async (request: RpcRequestContext) => {
            const invocation = this.activeInvocationContext;
            const previous = invocation?.requestSignal;
            if (invocation) invocation.requestSignal = request.signal;
            try {
              return await handler(request);
            } finally {
              if (invocation) {
                if (previous === undefined) delete invocation.requestSignal;
                else invocation.requestSignal = previous;
              }
            }
          },
        ]),
      ) as Record<string, (request: RpcRequestContext) => unknown>;
      // Alarm delivery is an internal host-control operation, not an
      // application RPC declaration. It still enters through the canonical
      // request owner so cancellation and terminal alarm persistence join.
      exposedHandlers["__alarm"] = async (request: RpcRequestContext) => {
        const invocation = this.activeInvocationContext;
        const previous = invocation?.requestSignal;
        if (invocation) invocation.requestSignal = request.signal;
        try {
          return { nextAlarm: await this.alarm() };
        } finally {
          if (invocation) {
            if (previous === undefined) delete invocation.requestSignal;
            else invocation.requestSignal = previous;
          }
        }
      };
      const exposedWebsites = Object.fromEntries(
        [...rpcExposedMethodNames(this)].map((name) => {
          const policy = this.rpcAuthorityDeclaration(
            name,
            (this.constructor as typeof DurableObjectBase).rpcMethods?.[name],
          );
          if (!policy)
            throw new Error(`RPC method ${name} lacks an authority declaration`);
          return [name, policy.website];
        }),
      ) as Record<string, WebsiteMethodPolicy>;
      exposedWebsites["__alarm"] = {
        kind: "closed",
        reason: "Alarm delivery is reserved for the authenticated host scheduler.",
      };
      connectionless.client.exposeAll(
        // The framework base itself contains intentionally public, @rpc-marked
        // lifecycle/capability methods. The decorator allow-list is the security
        // boundary; stopping before DurableObjectBase would make those methods
        // impossible to call on every subclass.
        exposedHandlers,
        exposedWebsites,
      );
      this._connectionless = connectionless;

    }
    return this._connectionless;
  }

  /** OAuth client for token access */
  protected get credentials(): CredentialClient {
    if (!this._credentials)
      this._credentials = createCredentialClient(this.rpc);
    return this._credentials;
  }

  /** Notification client for shell notifications */
  protected get notifications(): NotificationClient {
    if (!this._notifications)
      this._notifications = createNotificationClient(this.rpc);
    return this._notifications;
  }

  /** Blob storage uses this object's identity and invocation authority. */
  protected get blobstore(): BlobstoreClient {
    return (this._blobstore ??= createBlobstoreClient(this.rpc, this.fs));
  }

  /** Filesystem client */
  protected get fs(): RuntimeFs {
    if (!this._fs) this._fs = createRpcFs(this.rpc);
    return this._fs;
  }

  protected get rpcCallerId(): string | null {
    const context = this._invocationContext.current();
    return context ? context.callerId : this._currentRpcCallerId;
  }

  protected get rpcCallerKind(): string | null {
    const context = this._invocationContext.current();
    return context ? context.callerKind : this._currentRpcCallerKind;
  }

  /**
   * The authenticated caller of the in-flight method, in the canonical
   * `AuthenticatedCaller` shape shared with the bridge and server. Sourced from
   * the host-attested caller carried by the canonical RPC envelope. Null when
   * there is no active RPC caller (e.g. alarm/lifecycle). Workspace and user IDs
   * describe caller attribution; use `this.authorization` for host authority facts.
   */
  protected get caller(): AuthenticatedCaller | null {
    if (this.activeVerifiedCaller) {
      const caller = this.activeVerifiedCaller;
      return {
        callerId: caller.callerId,
        callerKind: caller.callerKind,
        ...(caller.callerPanelId
          ? { callerPanelId: caller.callerPanelId }
          : {}),
        ...(caller.userId ? { userId: caller.userId } : {}),
        ...(caller.workspaceId ? { workspaceId: caller.workspaceId } : {}),
      };
    }
    if (this._invocationContext.current()) return null;
    const callerId = this._currentRpcCallerId;
    if (!callerId) return null;
    return {
      callerId,
      callerKind:
        (this._currentRpcCallerKind as AuthenticatedCaller["callerKind"]) ??
        "unknown",
      ...(this._currentRpcCallerPanelId
        ? { callerPanelId: this._currentRpcCallerPanelId }
        : {}),
    };
  }

  /** Complete host-attested facts for the active direct dispatch. */
  protected get authorization(): AuthorizationContext | null {
    return this.activeVerifiedCaller?.authorization?.context ?? null;
  }

  protected get rpcCallerPanelId(): string | null {
    const context = this._invocationContext.current();
    return context ? context.callerPanelId : this._currentRpcCallerPanelId;
  }

  /** Correlation id of the inbound call, when the caller stamped one. */
  /** The actual inbound observation lifetime; capture before awaiting or detaching. */
  protected get rpcAbortSignal(): AbortSignal | null {
    return this.activeInvocationContext?.requestSignal ?? null;
  }

  protected get rpcRequestId(): string | null {
    const context = this._invocationContext.current();
    return context ? context.requestId : this._currentRpcRequestId;
  }

  /** Dedup key of the inbound call, when the caller stamped one. */
  protected get rpcIdempotencyKey(): string | null {
    const context = this._invocationContext.current();
    return context ? context.idempotencyKey : this._currentRpcIdempotencyKey;
  }

  /** Last value pushed via `setOwnTitle` during this activation. Used to
   *  dedupe redundant `runtime.setTitle` RPCs. Persists only across method
   *  calls within one isolate; on hibernation it resets. */
  private _titleSetForThisActivation: string | null = null;
  /**
   * A DO can be constructed while its runtime entity is still being prepared.
   * Constructor-time title setters therefore run before the WorkspaceDO row is
   * mirrored into the host principal cache. Keep the desired title until the
   * first authenticated ordinary request instead of sending a request that can
   * only fail with "Unknown principal kind".
   */
  private _pendingOwnTitle: { value: string | null; explicit: boolean } | null =
    null;

  /** Persistent state key used to record explicit (tool-driven) title sets.
   *  When this key is "1" the heuristic first-message fallback in chat agents
   *  is suppressed so explicit titles survive hibernation/restart. */
  private static readonly EXPLICIT_TITLE_STATE_KEY = "__title_explicit";

  protected get titleSetForThisActivation(): string | null {
    return this._titleSetForThisActivation;
  }

  /**
   * Returns true iff a previous activation called `setOwnTitleExplicitly`.
   * Heuristic title setters (e.g. chat agents' first-user-message fallback)
   * should bail when this is true so a user-confirmed title isn't overwritten.
   */
  protected isOwnTitleExplicitlySet(): boolean {
    try {
      return (
        this.getStateValue(DurableObjectBase.EXPLICIT_TITLE_STATE_KEY) === "1"
      );
    } catch {
      // `state` table may not exist before the first ensureReady — read
      // returning false is the safe default (no explicit title yet).
      return false;
    }
  }

  /**
   * Set the title and durably record that an explicit setter (e.g. the
   * built-in `set_title` agent tool) chose it. Subsequent activations check
   * `isOwnTitleExplicitlySet` before running any heuristic fallback.
   */
  protected async setOwnTitleExplicitly(
    title: string | null | undefined,
  ): Promise<void> {
    await this.setOwnTitle(title, { explicit: true });
    try {
      this.ensureReady();
      this.setStateValue(DurableObjectBase.EXPLICIT_TITLE_STATE_KEY, "1");
    } catch (err) {
      console.warn(
        "[DurableObjectBase] failed to persist explicit-title flag:",
        err,
      );
    }
  }

  /**
   * Set the server-controlled display title for this entity. Approval UIs
   * (and any other surface that resolves an entity by id) show this in
   * place of the opaque id. Best-effort — failures log a warning and do
   * not throw. Pass null/empty to clear.
   *
   * This is the heuristic / non-persisting setter — use
   * `setOwnTitleExplicitly` when an explicit tool call drives the change.
   */
  protected async setOwnTitle(
    title: string | null | undefined,
    options: { explicit?: boolean } = {},
  ): Promise<void> {
    const normalized = title == null ? null : title.trim();
    const effective = normalized && normalized.length > 0 ? normalized : null;
    if (effective === this._titleSetForThisActivation) return;
    this._titleSetForThisActivation = effective;

    // A constructor (or another activation callback before the first request)
    // has no authenticated inbound invocation yet. The entity activation that
    // owns this DO is still in flight, so defer the host call until the first
    // ordinary request after that activation commits.
    if (
      !this._invocationContext.current() &&
      this._currentRpcCallerId === null
    ) {
      this._pendingOwnTitle = {
        value: effective,
        explicit: options.explicit === true,
      };
      return;
    }

    await this.sendOwnTitle(effective, options.explicit === true);
  }

  /** Flush a constructor-time title after runtime entity activation. */
  private async flushPendingOwnTitle(): Promise<void> {
    const pending = this._pendingOwnTitle;
    if (!pending) return;
    this._pendingOwnTitle = null;
    await this.sendOwnTitle(pending.value, pending.explicit);
  }

  private async sendOwnTitle(
    effective: string | null,
    explicit: boolean,
  ): Promise<void> {
    let bridge: Pick<RpcClient, "call">;
    try {
      bridge = this.rpc;
    } catch (err) {
      // `this.rpc` throws when the workerd env bindings aren't ready yet —
      // typical during constructor-time calls before the first request has
      // attached the RPC token. Skip silently; setOwnTitle will be retried
      // on the next caller (request, alarm, RPC handler).
      void err;
      return;
    }
    // Test harnesses point GATEWAY_URL at an unreachable sentinel; emit no
    // noise when the RPC fails in that mode. Real installs surface failures.
    const gatewayUrl = String(this.env["GATEWAY_URL"] ?? "");
    const isTestSentinel =
      gatewayUrl.includes("test-server.invalid") ||
      gatewayUrl.includes(".test/");
    const runtimeService = createTypedRpcServiceClient(bridge, { targetId: "main", namespace: "runtime" }, runtimeMethods);
    try {
      await runtimeService.setTitle(effective, { explicit });
    } catch (err) {
      if (!isTestSentinel) {
        console.warn("[DurableObjectBase] runtime.setTitle failed:", err);
      }
    }
  }

  // --- Object key identity ---
  // Set from the first fetch() request URL: /{objectKey}/{method}
  // The router includes the objectKey in the forwarded URL.

  private _objectKey: string | null = null;

  protected get objectKey(): string {
    if (this._objectKey) return this._objectKey;
    // Fallback to ctx.id.name (available in some workerd versions)
    const name = this.ctx.id.name;
    if (name) {
      this._objectKey = name;
      return name;
    }
    // Fallback to persisted state (survives hibernation)
    try {
      const stored = this.sql
        .exec(`SELECT value FROM state WHERE key = '__objectKey'`)
        .toArray();
      if (stored.length > 0) {
        this._objectKey = stored[0]!["value"] as string;
        return this._objectKey;
      }
    } catch {
      /* state table may not exist yet */
    }
    throw new Error(
      "objectKey not available — no request received yet and ctx.id.name not set",
    );
  }

  /** Concrete immutable runtime identity presented by this object on outbound RPC. */
  protected get rpcSelfId(): string {
    return `do:${String(this.env["WORKER_SOURCE"] ?? "")}:${String(
      this.env["WORKER_CLASS_NAME"] ?? this.constructor.name,
    )}:${this.objectKey}`;
  }

  // --- Alarm (server-driven; persists across workerd/server restarts) ---
  //
  // workerd does not implement alarms for SQLite-backed Durable Objects (and
  // never for facets), so the wake time is registered durably with the server
  // (WorkspaceDO `do_alarms`) and the server's AlarmDriver fires `__alarm` on
  // schedule. Ordinary calls keep the synchronous `ctx.storage.setAlarm`
  // shape, while fetch() drains the tracked relay writes before returning so
  // the wake is durable across immediate hibernation/eviction. Alarm handlers
  // instead return their complete next scheduling decision to AlarmDriver.

  protected setAlarm(delayMs: number): void {
    this.setAlarmAt(Date.now() + delayMs);
  }

  /** Schedule the alarm at an absolute epoch-ms time. */
  protected setAlarmAt(timeMs: number): void {
    this.trackAlarmRpc(this.persistAlarmSchedule({ wakeAt: timeMs }));
  }

  /** Cancel any pending alarm for this DO. */
  protected deleteAlarm(): void {
    this.trackAlarmRpc(this.persistAlarmSchedule(null));
  }

  /** Persist an exact alarm projection from activation-owned work which has
   * no later fetch-finally drain boundary. */
  protected async persistAlarmSchedule(
    schedule: DoAlarmSchedule | null,
  ): Promise<void> {
    if (schedule) {
      await this.workspaceStateService.alarmSet({
        ...this.lifecycleKey(),
        wakeAt: schedule.wakeAt,
      });
      return;
    }
    await this.workspaceStateService.alarmClear(this.lifecycleKey());
  }

  private readonly pendingAlarmRpcs = new Set<Promise<void>>();
  private readonly terminalAlarmDrainResponses = new WeakSet<Response>();

  private trackAlarmRpc(pending: Promise<void>): void {
    // The request may take another async turn before its fetch boundary drains
    // this set. Observe rejection now while retaining the original promise for
    // drainAlarmRpcs to report after all owned writes settle.
    void pending.catch(() => undefined);
    this.pendingAlarmRpcs.add(pending);
    this.activeInvocationContext?.alarmRpcs?.add(pending);
  }

  private async drainAlarmRpcs(): Promise<void> {
    await this.drainOwnedAlarmRpcs(this.pendingAlarmRpcs);
  }

  private async drainOwnedAlarmRpcs(owned: Set<Promise<void>>): Promise<void> {
    const failures: unknown[] = [];
    while (owned.size > 0) {
      const pending = [...owned];
      const outcomes = await Promise.allSettled(pending);
      for (const [index, outcome] of outcomes.entries()) {
        const item = pending[index]!;
        owned.delete(item);
        if (owned !== this.pendingAlarmRpcs) this.pendingAlarmRpcs.delete(item);
        if (outcome.status === "rejected") failures.push(outcome.reason);
      }
    }
    const uniqueFailures = [...new Set(failures)];
    if (uniqueFailures.length === 1) throw uniqueFailures[0];
    if (uniqueFailures.length > 1) {
      throw new AggregateError(
        uniqueFailures,
        "Multiple durable alarm persistence RPCs failed",
        { cause: uniqueFailures[0] },
      );
    }
  }

  private lifecycleKey(): {
    source: string;
    className: string;
    objectKey: string;
  } {
    return {
      source: String(this.env["WORKER_SOURCE"] ?? ""),
      className: String(this.env["WORKER_CLASS_NAME"] ?? this.constructor.name),
      objectKey: this.objectKey,
    };
  }

  /**
   * Typed client for the workspace-state service. Built lazily — the call
   * function dereferences `this.rpc` per call, so constructing the client
   * never touches the (possibly not-yet-ready) RPC bridge.
   */
  private _workspaceStateService?: TypedServiceClient<
    typeof workspaceStateMethods
  >;

  private get workspaceStateService(): TypedServiceClient<
    typeof workspaceStateMethods
  > {
    return (this._workspaceStateService ??= createTypedRpcServiceClient(this.rpc, { targetId: "main", namespace: "workspace-state" }, workspaceStateMethods));
  }

  /** Override in subclasses for timed callbacks. Return the one exact next wake. */
  async alarm(): Promise<DoAlarmSchedule | null> {
    await this.initializeSchema();
    const queues = this.pendingDurableWorkReadyQueues();
    if (queues.length > 0) this.emitWorkReadyHint(...queues);
    return null;
  }

  /**
   * Project durable/domain scheduling facts after an ordinary request.
   *
   * `undefined` means this class does not own a derived schedule. `null`
   * explicitly clears the alarm. Alarm delivery bypasses this hook because an
   * alarm returns the same projection directly to AlarmDriver.
   */
  protected nextAlarmAfterRequest():
    | DoAlarmSchedule
    | null
    | undefined
    | Promise<DoAlarmSchedule | null | undefined> {
    return undefined;
  }

  // --- HTTP dispatch + WebSocket upgrade ---

  async fetch(request: Request): Promise<Response> {
    const dispatchResult = await Promise.resolve()
      .then(async (): Promise<Response> => {
        const segments = new URL(request.url).pathname
          .split("/")
          .filter(Boolean);
        if (segments.length >= 1 && !this._objectKey) {
          this._objectKey = decodeURIComponent(segments[0]!);
        }
        const objectKey = this._objectKey ?? this.ctx.id.name;
        if (!objectKey)
          throw new Error("Durable Object request has no exact object key");
        return dispatchWithDurableObjectSchemaGuard({
          request,
          identity: {
            source: String(this.env["WORKER_SOURCE"] ?? ""),
            className: String(
              this.env["WORKER_CLASS_NAME"] ?? this.constructor.name,
            ),
            objectKey,
          },
          ensureReady: () => this.initializeSchema(),
          dispatch: () => this.dispatchFetch(request),
        });
      })
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );

    // setAlarmAt/deleteAlarm mirror the synchronous DO storage API, but this
    // runtime persists alarms through an asynchronous server RPC. Do not let a
    // request return until those durability writes have settled: a hibernation
    // or eviction immediately after the response must never lose the only wake
    // that advances an effect outbox.
    const terminalOwnsAlarmDrain =
      dispatchResult.status === "fulfilled" &&
      this.terminalAlarmDrainResponses.has(dispatchResult.value);
    const alarmResult = terminalOwnsAlarmDrain
      ? ({ status: "fulfilled" as const, value: undefined } as const)
      : await this.drainAlarmRpcs().then(
          () => ({ status: "fulfilled" as const, value: undefined }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        );

    if (
      dispatchResult.status === "rejected" ||
      alarmResult.status === "rejected"
    ) {
      const failures = [
        ...(dispatchResult.status === "rejected" ? [dispatchResult.reason] : []),
        ...(alarmResult.status === "rejected" ? [alarmResult.reason] : []),
      ];
      const uniqueFailures = [...new Set(failures)];
      const failure = uniqueFailures.length === 1 ? uniqueFailures[0] : new AggregateError(
        uniqueFailures, "Durable Object request and alarm persistence failed", { cause: failures[0] }
      );
      return new Response(
        encodeRpcJson({
          error: serializeRpcFailure(failure),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return dispatchResult.value;
  }

  private async dispatchFetch(request: Request): Promise<Response> {
    // Parse /{objectKey}/{method} — router includes objectKey in forwarded URL
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 1 && !this._objectKey) {
      this._objectKey = decodeURIComponent(segments[0]!);
      // Persist for hibernation recovery
      try {
        this.sql.exec(
          `INSERT OR IGNORE INTO state (key, value) VALUES ('__objectKey', ?)`,
          this._objectKey,
        );
      } catch {
        /* state table may not exist yet — ensureReady hasn't run */
      }
    }

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    const method = segments.slice(1).join("/") || "getState";
    if (this.env["VIBESTUDIO_SCHEMA_PROBE"] === true) {
      return method === "__vibestudio_schema_descriptor"
        ? this.schemaDescriptorResponse()
        : new Response("Schema probes refuse application dispatch", {
            status: 403,
          });
    }
    const authorityAcceptedAt = directAuthorityAcceptedAt(request);

    // Converged inbound dispatch: an `RpcEnvelope` POSTed to `__rpc` (relay
    // traffic and server→DO event push) flows through the shared
    // core's `handleEnvelope` → `exposeAll`'d method / event listeners.
    if (method === "__rpc") {
      return this.handleInboundEnvelope(request);
    }

    let args: unknown[] = [];
    let verifiedCallerFromBody: AttestedCaller | null = null;
    if (request.method === "POST") {
      const body = await request.text();
      if (body) {
        const result = this.parseRequestBody(body);
        if (result.error) {
          return new Response(encodeRpcJson({ error: result.error }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        args = result.args;
        verifiedCallerFromBody = result.caller ?? null;
      }
    }

    if (
      method === "__lifecycle/prepare" ||
      method === "__lifecycle/resume" ||
      method === "__lifecycle/initializeClone"
    ) {
      return await this.withVerifiedCaller(verifiedCallerFromBody, async () => {
        const denial = this.inboundHostControlDenial(
          method,
          authorityAcceptedAt,
        );
        if (denial) {
          return new Response(
            encodeRpcJson({
              error: { message: denial.reason, code: denial.code, errorKind: "access", errorData: { authorityFailure: denial.failure } },
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        // Live module replacement may update the class schema while this
        // activation retains its previous schemaReady cache. Lifecycle is the
        // generation boundary, so revalidate the one current schema here.
        await this.ensureSchema();
        const result =
          method === "__lifecycle/prepare"
            ? await (async () => {
                const input = parseLifecyclePrepareInput(args[0]);
                  this.lifecyclePreparation.advance(input);
                  if (input.phase === "cancel") {
                    await this.cancelLifecyclePreparation(input);
                    this.lifecyclePreparation.cancelled(input);
                    return { status: "ready" } satisfies LifecyclePrepareResult;
                  }
                if (input.phase === "quiesce") this.beginLifecycleRelease(input);
                const failures: unknown[] = [];
                if (input.phase === "quiesce") {
                  try {
                    await this.drainAlarmRpcs();
                  } catch (error) {
                    failures.push(error);
                  }
                }
                let released: LifecyclePrepareResult | undefined;
                if (failures.length === 0) {
                  try {
                    released = await this.releaseForLifecycle(input);
                  } catch (error) {
                    failures.push(error);
                  }
                }
                if (failures.length === 1) throw failures[0];
                if (failures.length)
                  throw new AggregateError(
                    failures,
                    "Lifecycle preparation failed",
                    { cause: failures[0] },
                  );
                return released!;
              })()
            : method === "__lifecycle/initializeClone"
              ? this.initializeClone(args[0] as LifecycleCloneInput)
              : await (async () => { await this.resumeAfterRestart(args[0] as LifecycleResumeInput); this.lifecyclePreparation.resumed(); })();
        return new Response(encodeRpcJson({
          value: result ?? null,
          metadata: { durableWorkReady: [...(this._invocationContext.current()?.readyQueues ?? [])].sort() },
        }), {
          headers: { "Content-Type": "application/json" },
        });
      });
    }

    // Method-path dispatch (the server's instance-token channel,
    // `DODispatch.dispatch`): build an inbound request envelope from
    // {method, args, __caller} and route it through the SAME converged core
    // dispatch as `__rpc`. `(this)[method]` is gone — `exposeAll` is the single
    // dispatch. Returns the raw method result (the DODispatch contract).
    // The method path is authored only by the DO's declared application RPC
    // surface. Internal host-control operations such as `__alarm` are routed
    // solely through their canonical authenticated envelope.
    if (!rpcExposedMethodNames(this).has(method)) {
      return new Response(
        encodeRpcJson({ error: `Unknown method: ${method}` }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    const caller: AttestedCaller = verifiedCallerFromBody ?? {
      callerId: "",
      callerKind: "unknown",
    };
    const envelope = envelopeFromMessage({
      selfId: `do:${this.env["WORKER_SOURCE"]}:${this.env["WORKER_CLASS_NAME"]}:${this.objectKey}`,
      from: caller.callerId || "unknown",
      target: `do:${this.env["WORKER_SOURCE"]}:${this.env["WORKER_CLASS_NAME"]}:${this.objectKey}`,
      caller,
      message: {
        type: "request",
        requestId: crypto.randomUUID(),
        fromId: caller.callerId || "unknown",
        method,
        args,
      },
    });
    const dispatched = await this.dispatchInboundEnvelope(
      envelope,
      directAuthorityAcceptedAt(request),
    );
    const responseEnvelope = dispatched.result;
    const responseMessage = responseEnvelope?.message;
    if (responseMessage?.type === "response" && "error" in responseMessage) {
      if (responseMessage.error.message.startsWith('Method "')) {
        return new Response(
          encodeRpcJson({
            error: `Unknown method: ${method}`,
            metadata: { durableWorkReady: [...dispatched.readyQueues].sort() },
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      const status =
        responseMessage.error.code === "EACCES" ||
        responseMessage.error.code === "EVAL_READ_ONLY"
          ? 403
          : 500;
      return new Response(
        encodeRpcJson({
          error: responseMessage.error,
          metadata: { durableWorkReady: [...dispatched.readyQueues].sort() },
        }),
        {
          status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const result =
      responseMessage?.type === "response" && "result" in responseMessage
        ? (responseMessage.result ?? null)
        : null;
    return new Response(
      encodeRpcJson({
        value: result,
        metadata: { durableWorkReady: [...dispatched.readyQueues].sort() },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  /** Handle an `RpcEnvelope` POSTed to `__rpc`; returns a response envelope (or `{}` for events). */
  private async handleInboundEnvelope(request: Request): Promise<Response> {
    const envelope = decodeRpcJson(await request.text()) as RpcEnvelope;
    const message = envelope.message;
    const authorityAcceptedAt = directAuthorityAcceptedAt(request);
    if (message?.type === "event") {
      const caller =
        (envelope.delivery.caller as AttestedCaller | undefined) ?? null;
      const event = message as RpcEvent;
      const method = `__event:${event.event}`;
      const audience = this.directAuthorityAudience();
      const denial = directRpcDenial({
        kind: "event",
        method,
        eventTopic: event.event,
        caller,
        attestation: caller?.authorization ?? null,
        declaration: eventIntakeAuthority(this, event.event),
        audience,
        resourceKey: audience,
        capability: `event:${event.event}`,
        now: authorityAcceptedAt,
      });
      if (denial) {
        return new Response(
          encodeRpcJson({
            error: { message: denial.reason, code: denial.code, errorKind: "access", errorData: { authorityFailure: denial.failure } },
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      const attestation = caller?.authorization;
      if (
        !attestation ||
        !this._directRpcNonces.consume(
          attestation.nonce,
          attestation.expiresAt,
          authorityAcceptedAt,
        )
      ) {
        const reason =
          `${method}: host authority attestation nonce was replayed or is outside ` +
          "the receiver's retention bound";
        return new Response(
          encodeRpcJson({
            error: { message: reason, code: "EACCES", errorKind: "access", errorData: {
              authorityFailure: directRpcInvalidAttestationFailure(reason),
            } },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      this.connectionlessClient().deliver(envelope);
      return new Response(encodeRpcJson({}), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (message?.type !== "request" && message?.type !== "stream-request") {
      this.connectionlessClient().deliver(envelope);
      return new Response(encodeRpcJson({}), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (message.type === "stream-request") {
      const dispatched = await this.dispatchInboundEnvelope(
        {
          ...envelope,
          message: { ...message, type: "request" } satisfies RpcRequest,
        },
        authorityAcceptedAt,
      );
      const responseEnvelope = dispatched.result;
      const responseMessage = responseEnvelope?.message;
      if (responseMessage?.type === "response" && "result" in responseMessage) {
        if (responseMessage.result instanceof Response)
          return responseMessage.result;
        return new Response(
          encodeRpcJson({
            error: serializeRpcFailure(new Error(`Streaming method ${message.method} did not return a Response`)),
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      if (responseMessage?.type === "response" && "error" in responseMessage) {
        const status =
          responseMessage.error.code === "EACCES" ||
          responseMessage.error.code === "EVAL_READ_ONLY"
            ? 403
            : 500;
        return new Response(
          encodeRpcJson({
            error: responseMessage.error,

          }),
          { status, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        encodeRpcJson({
          error: serializeRpcFailure(new Error(`Streaming method ${message.method} did not produce a response`)),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    let markAdmitted!: () => void;
    const admitted = new Promise<void>((resolve) => {
      markAdmitted = resolve;
    });
    const ownedAlarmRpcs = new Set<Promise<void>>();
    const completion = this.dispatchInboundEnvelope(
      envelope,
      authorityAcceptedAt,
      markAdmitted,
      ownedAlarmRpcs,
    )
      .then(async (dispatched) => {
      try {
        // A handler may schedule its alarm after the outer fetch has already
        // crossed the admission boundary. Keep that durability write inside
        // the terminal response owner so the caller cannot observe completion
        // before the next wake is committed.
        await this.drainOwnedAlarmRpcs(ownedAlarmRpcs);
      } catch (alarmFailure) {
        const previous = dispatched.result?.message;
        const previousIsError =
          previous?.type === "response" && "error" in previous;
        const previousFailure = previousIsError ? deserializeRpcFailure(previous.error) : undefined;
        const failure = previousFailure ? new AggregateError(
          [previousFailure, alarmFailure], "RPC handler and durable alarm persistence failed", { cause: previousFailure }
        ) : alarmFailure;
        dispatched = {
          ...dispatched,
          result: responseEnvelopeFor(
            envelope,
            { callerId: envelope.target, callerKind: "do" },
            { type: "response", requestId: message.requestId, error: serializeRpcFailure(failure) },
          ),
        };
      }
        return dispatched;
      })
      .catch(async (primary: unknown) => {
        let failure = primary;
        try {
          await this.drainOwnedAlarmRpcs(ownedAlarmRpcs);
        } catch (alarmFailure) {
          failure = new AggregateError(
            [primary, alarmFailure],
            `RPC dispatch and alarm persistence failed: ${primary instanceof Error ? primary.message : String(primary)}; ${alarmFailure instanceof Error ? alarmFailure.message : String(alarmFailure)}`,
            { cause: primary },
          );
        }
        return {
          result: responseEnvelopeFor(
            envelope,
            { callerId: this.rpcSelfId, callerKind: "do" },
            { type: "response", requestId: message.requestId, error: serializeRpcFailure(failure) },
          ),
          readyQueues: [],
        };
      });
    const first = await Promise.race([
      admitted.then(() => ({ kind: "admitted" as const })),
      completion.then((dispatched) => ({ kind: "completed" as const, dispatched })),
    ]);
    if (first.kind === "completed") {
      return new Response(encodeRpcJson(first.dispatched.result ?? {}), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        void completion.then(
          (dispatched) => {
            controller.enqueue(
              new TextEncoder().encode(encodeRpcJson(dispatched.result ?? {})),
            );
            controller.close();
          },
          (error: unknown) => controller.error(error),
        );
      },
    });
    const terminalResponse = new Response(body, {
      headers: { "Content-Type": "application/json" },
    });
    this.terminalAlarmDrainResponses.add(terminalResponse);
    return terminalResponse;
  }

  /** Evaluate the method's complete declaration against fresh host mediation. */
  private inboundCallerDenial(
    method: string | undefined,
    args: readonly unknown[],
    caller: AttestedCaller | null,
    authorityAcceptedAt: number,
    wireMethod?: MethodSchema,
  ): DirectRpcDenial | null {
    if (!method) return null;
    const declaration = this.rpcAuthorityDeclaration(method, wireMethod);
    const audience = this.directAuthorityAudience();
    const attestation = caller?.authorization ?? null;
    const resourceKey = directRpcInvocationResourceKey({
      audience,
      declaration,
      attestation,
      args,
    });
    return directRpcDenial({
      kind: "call",
      method,
      caller,
      attestation,
      declaration,
      audience,
      resourceKey,
      capability: caller?.authorization?.capability ?? "",
      now: authorityAcceptedAt,
    });
  }

  private directAuthorityAudience(): string {
    return `do:${String(this.env["WORKER_SOURCE"])}:${String(this.env["WORKER_CLASS_NAME"])}:${this.objectKey}`;
  }

  private inboundHostControlDenial(
    method: string,
    authorityAcceptedAt: number,
    caller: AttestedCaller | null = this.activeVerifiedCaller,
  ): HostControlDenial | null {
    const attestation = caller?.authorization ?? null;
    const denial = hostControlDenial({
      method,
      attestation,
      audience: this.directAuthorityAudience(),
      now: authorityAcceptedAt,
    });
    if (denial) return denial;
    if (
      !attestation ||
      !this._directRpcNonces.consume(
        attestation.nonce,
        attestation.expiresAt,
        authorityAcceptedAt,
      )
    ) {
      const reason =
        `${method}: host authority attestation nonce was replayed or is outside ` +
        "the receiver's retention bound";
      return {
        code: "EACCES",
        reason,
        failure: directRpcInvalidAttestationFailure(reason),
      };
    }
    return null;
  }

  /**
   * Dispatch an inbound request envelope through the converged core
   * (`respond` → `handleEnvelope` → `exposeAll`'d method), with the DO's
   * caller-context getters bound to `envelope.delivery.caller` for the duration.
   */
  private async dispatchInboundEnvelope(
    envelope: RpcEnvelope,
    authorityAcceptedAt: number,
    onAdmitted?: () => void,
    ownedAlarmRpcs?: Set<Promise<void>>,
  ): Promise<{ result: RpcEnvelope | null; readyQueues: DurableWorkQueue[] }> {
    const connectionless = this.connectionlessClient();
    // An unattributed method-path call carries a synthetic empty caller; surface
    // it as a null caller context (matching the pre-convergence behavior) rather
    // than a forgeable `"unknown"` — methods that gate on `this.caller` rely on it.
    const rawCaller = envelope.delivery.caller;
    const caller =
      rawCaller && rawCaller.callerId !== ""
        ? (rawCaller as AttestedCaller)
        : null;
    const message = envelope.message as RpcRequest;
    const method = message?.method;
    const wireMethod = method
      ? (this.constructor as typeof DurableObjectBase).rpcMethods?.[method]
      : undefined;
    if (wireMethod && message) {
      const tupleItems = (
        wireMethod.args as unknown as { _def?: { items?: readonly unknown[] } }
      )._def?.items;
      const args = message.args ?? [];
      const paddedArgs = tupleItems
        ? [...args, ...Array(Math.max(0, tupleItems.length - args.length))]
        : args;
      const parsedArgs = wireMethod.args.safeParse(paddedArgs);
      if (!parsedArgs.success) {
        return {
          result: this.schemaDenialResponse(
            envelope,
            message,
            `Invalid arguments for ${method}: ${parsedArgs.error.message}`,
          ),
          readyQueues: [],
        };
      }
      message.args = parsedArgs.data as unknown[];
    }
    const hostControl = method === "__alarm";
    const denial = hostControl
      ? this.inboundHostControlDenial(method, authorityAcceptedAt, caller)
      : this.inboundCallerDenial(
          method,
          message?.args ?? [],
          caller,
          authorityAcceptedAt,
          wireMethod,
        );
    if (denial) {
      return {
        result: {
          from: envelope.target,
          target: envelope.from,
          delivery: {
            caller: caller ?? { callerId: "", callerKind: "unknown" },
          },
          provenance: envelope.provenance ?? [],
          message: { type: "response", requestId: message?.requestId ?? "", error: { message: denial.reason, code: denial.code, errorKind: "access", errorData: { authorityFailure: denial.failure } } },
        } as RpcEnvelope,
        readyQueues: [],
      };
    }
    const attestation = caller?.authorization;
    if (
      !hostControl &&
      attestation &&
      !this._directRpcNonces.consume(
        attestation.nonce,
        attestation.expiresAt,
        authorityAcceptedAt,
      )
    ) {
      const reason =
        `${message?.method ?? "<unknown>"}: host authority attestation nonce was replayed ` +
        "or is outside the receiver's retention bound";
      return {
        result: {
          from: envelope.target,
          target: envelope.from,
          delivery: {
            caller: caller ?? { callerId: "", callerKind: "unknown" },
          },
          provenance: envelope.provenance ?? [],
          message: { type: "response", requestId: message?.requestId ?? "", error: { message: reason, code: "EACCES", errorKind: "access", errorData: {
              authorityFailure: directRpcInvalidAttestationFailure(reason),
            } } },
        } as RpcEnvelope,
        readyQueues: [],
      };
    }
    const dispatched = await this.withRpcCaller(
      caller,
      message,
      envelope,
      ownedAlarmRpcs,
      async () => {
        // Constructor-time title writes are held until the first authenticated
        // ordinary request. Lifecycle probes happen before the host commits the
        // entity row, so they must not release that write early.
        if (
          message?.method !== "__lifecycle/prepare" &&
          message?.method !== "__lifecycle/resume" &&
          message?.method !== "__lifecycle/initializeClone" &&
          message?.method !== "__alarm"
        ) {
          await this.flushPendingOwnTitle();
        }
        const invocation = connectionless.respond(envelope);
        onAdmitted?.();
        return invocation.completion;
      },
    );
    const response = dispatched.result;
    if (response?.message.type === "response" && dispatched.readyQueues.length > 0) {
      response.message.metadata = {
        ...response.message.metadata,
        durableWorkReady: [...dispatched.readyQueues].sort(),
      };
    }
    if (
      wireMethod?.returns &&
      response?.message.type === "response" &&
      !("error" in response.message)
    ) {
      const parsedResult = wireMethod.returns.safeParse(
        response.message.result,
      );
      if (!parsedResult.success) {
        const denial = this.schemaDenialResponse(
          envelope,
          message,
          `Invalid result from ${method}: ${parsedResult.error.message}`,
        );
        if (dispatched.readyQueues.length > 0 && denial.message.type === "response") {
          denial.message.metadata = { durableWorkReady: [...dispatched.readyQueues].sort() };
        }
        return {
          result: denial,
          readyQueues: dispatched.readyQueues,
        };
      }
      response.message.result = parsedResult.data;
    }
    return dispatched;
  }

  private schemaDenialResponse(
    envelope: RpcEnvelope,
    message: RpcRequest,
    reason: string,
  ): RpcEnvelope {
    return {
      from: envelope.target,
      target: envelope.from,
      delivery: envelope.delivery,
      provenance: envelope.provenance ?? [],
      message: { type: "response", requestId: message.requestId, error: { message: reason, code: "EINVAL", errorKind: "protocol" } },
    };
  }

  private async withVerifiedCaller<T>(
    caller: AttestedCaller | null,
    callback: () => Promise<T>,
  ): Promise<T> {
    const context: RpcInvocationContext = {
      verifiedCaller: caller,
      authorityActive: true,
      callerId: caller?.callerId ?? null,
      callerKind: caller?.callerKind ?? null,
      callerPanelId: caller?.callerPanelId ?? null,
      requestId: null,
      idempotencyKey: null,
      readyQueues: new Set(),
    };
    try {
      return await this._invocationContext.run(context, async () => {
        try {
          return await callback();
        } finally {
          await this._causalRpcOperations.drain(context);
        }
      });
    } finally {
      context.authorityActive = false;
    }
  }

  private async withRpcCaller<T>(
    caller: AttestedCaller | null,
    message: RpcRequest,
    envelope: RpcEnvelope,
    alarmRpcs: Set<Promise<void>> | undefined,
    callback: () => Promise<T>,
  ): Promise<{ result: T; readyQueues: DurableWorkQueue[] }> {
    const context: RpcInvocationContext = {
      verifiedCaller: caller,
      authorityActive: true,
      callerId: caller?.callerId ?? null,
      callerKind: caller?.callerKind ?? null,
      callerPanelId: caller?.callerPanelId ?? null,
      requestId: message?.requestId ?? null,
      idempotencyKey: envelope.delivery.idempotencyKey ?? null,
      readyQueues: new Set(),
      alarmRpcs,
    };
    try {
      const result = await this._invocationContext.run(context, async () => {
        try {
          const result = await callback();
          if (message.method !== "__alarm") {
            const nextAlarm = await this.nextAlarmAfterRequest();
            if (nextAlarm === null) this.deleteAlarm();
            else if (nextAlarm !== undefined) this.setAlarmAt(nextAlarm.wakeAt);
          }
          return result;
        } finally {
          // Derived wake publication belongs to this invocation too. Join it
          // before retiring the authority which admitted the request.
          await this._causalRpcOperations.drain(context);
        }
      });
      return { result, readyQueues: [...context.readyQueues] };
    } finally {
      context.authorityActive = false;
    }
  }

  /**
   * Advance authoritative queue readiness and attach an opportunistic response
   * hint when a response exists. Every caller follows the same durable path;
   * transport topology can affect latency, never correctness.
   */
  protected markWorkReady(...queues: DurableWorkQueue[]): void {
    const unique = [...new Set(queues)];
    this.emitWorkReadyHint(...unique);
    this._durableWorkReadiness.markReady(unique);
  }

  /**
   * Attach readiness already recorded in durable state to the current
   * response. Re-delivery must not manufacture another generation: one
   * committed transition remains one unacknowledged transition until drained.
   */
  private emitWorkReadyHint(...queues: DurableWorkQueue[]): void {
    const context = this._invocationContext.current();
    for (const queue of new Set(queues)) context?.readyQueues.add(queue);
  }

  /** Immediate alarm edge while any ready generation remains unacknowledged. */
  protected nextDurableWorkReadyEdgeAt(): number | null {
    return this.pendingDurableWorkReadyQueues().length > 0 ? Date.now() : null;
  }

  private pendingDurableWorkReadyQueues(): DurableWorkQueue[] {
    return this._durableWorkReadiness.pendingQueues((this.constructor as typeof DurableObjectBase).durableWorkQueues);
  }

  protected acknowledgeDurableWorkReady(queue: DurableWorkQueue): void {
    this._durableWorkReadiness.acknowledge(queue);
  }

  protected durableWorkReadinessDiagnostics() {
    return this._durableWorkReadiness.diagnostics((this.constructor as typeof DurableObjectBase).durableWorkQueues);
  }


  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  durableWorkCapabilities(): DurableWorkQueue[] {
    return [...(this.constructor as typeof DurableObjectBase).durableWorkQueues];
  }

  /** Finite delivery into an explicitly resident in-memory operation. The
   * durable sender retries when no receiver is active; this method owns no
   * stream, timer, or durable relationship state. */
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async acceptChannelDelivery(
    input: ResidentChannelDeliveryInput,
  ): Promise<unknown> {
    assertChannelDeliverySource({ id: this.rpcCallerId, kind: this.rpcCallerKind }, input,
      this.residentSessions.target(input.channelId));
    return this.residentSessions.acceptDelivery(input);
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async acceptChannelInvocation(
    input: ResidentChannelInvocationInput,
  ): Promise<unknown> {
    return this.residentSessions.acceptInvocation(input);
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancelChannelInvocation(
    input: ResidentChannelCancellationInput,
  ): Promise<unknown> {
    return this.residentSessions.cancelInvocation(input);
  }

  /** The host calls this after quiescence and before sealing RPC admission.
   * Owners with asynchronous durable obligations override it to join their
   * captured frontier through their normal work driver. */
  @rpc({ principals: ["host"], website: { kind: "closed", reason: "The host joins owner work before lifecycle release." }, effect: { kind: "open" }, tier: "open", sensitivity: "write" })
  async prepareDurableWorkRelease(_stage: DurableWorkReleaseStage): Promise<DurableWorkReleaseReceipt> {
    return { queues: [], barrier: null };
  }

  @rpc({ principals: ["host"], website: { kind: "closed", reason: "The host joins owner work before lifecycle release." }, effect: { kind: "open" }, tier: "open", sensitivity: "read" })
  async waitDurableWorkRelease(_stage: DurableWorkReleaseStage, barrier: DurableWorkReleaseReceipt["barrier"]): Promise<void> {
    if (barrier !== null) throw new Error("This owner has no durable-work release frontier");
  }

  /** Explicit owner-local registration capability for workspace Durable
   * Objects that declare mailbox invocation routing. Without this hook an
   * entity endpoint could join successfully but could never accept delivery. */
  protected registerResidentChannelSession(
    channelId: string,
    receiver: ResidentSessionReceiver,
    relationship: { targetId: string },
  ): () => void {
    return this.residentSessions.register(channelId, receiver, relationship);
  }

  protected residentSessionDiagnostics(): {
    active: number;
    receivers: Array<{ channelId: string; openedAt: number; ageMs: number }>;
  } {
    const receivers = this.residentSessions.inspect();
    return { active: receivers.length, receivers };
  }

  /**
   * Claim methods call this before selecting rows, so an immediate response
   * hint and a registry recovery scan have identical fencing semantics.
   */
  protected adoptDurableWorkWorkerGeneration(workerId: string): {
    adopted: boolean;
    previousWorkerId: string | null;
  } {
    return this._durableWorkReadiness.adoptWorker(
      workerId,
      (previousWorkerId, nextWorkerId) =>
        this.releaseDurableWorkClaims(previousWorkerId, nextWorkerId),
    );
  }

  protected releaseDurableWorkClaims(
    _previousWorkerId: string | null,
    _nextWorkerId: string,
  ): void {}

  private get activeVerifiedCaller(): AttestedCaller | null {
    const context = this.activeInvocationContext;
    return context ? context.verifiedCaller : this._currentVerifiedCaller;
  }

  private get activeInvocationContext(): RpcInvocationContext | null {
    const context = this._invocationContext.current();
    return context?.authorityActive ? context : null;
  }

  /** Override in subclasses to accept WebSocket connections. */
  protected handleWebSocketUpgrade(_request: Request): Response {
    return new Response("WebSocket not supported", { status: 426 });
  }

  /** Publish the lifecycle transition before joining any work it owns. */
  protected beginLifecycleRelease(_input: LifecyclePrepareInput): void {}

  protected async cancelLifecyclePreparation(_input: LifecyclePrepareInput): Promise<void> {}

  async releaseForLifecycle(
    _input: LifecyclePrepareInput,
  ): Promise<LifecyclePrepareResult> {
    return { status: "ready" };
  }

  async resumeAfterRestart(_input: LifecycleResumeInput): Promise<void> {
    // No generic continuation store: event-sourced subclasses re-derive their
    // pending work from their logs on wake.
  }

  /** Synchronous receiver-local storage preparation. Outbound authority stays closed. */
  protected initializeClonedStorage(_input: LifecycleCloneInput): void {}

  private initializeClone(input: LifecycleCloneInput): void {
    if (
      !input ||
      input.target.objectKey !== this.objectKey ||
      input.source.source !== input.target.source ||
      input.source.className !== input.target.className ||
      input.source.objectKey === input.target.objectKey ||
      !input.sourceContextId ||
      !input.targetContextId ||
      !input.authoritySessionId ||
      !input.buildKey ||
      !input.executionDigest ||
      !input.provenance ||
      input.provenance.sourceContextId !== input.sourceContextId ||
      input.provenance.sourceEntityId !==
        `do:${input.source.source}:${input.source.className}:${input.source.objectKey}`
    )
      throw new Error("Clone initialization does not match this incarnation");
    const encoded = canonicalJson(input);
    this.ctx.storage.transactionSync(() => {
      const previous = this.getStateValue("__clonePreparation");
      if (previous) {
        const receipt = JSON.parse(previous) as LifecycleCloneInput;
        if (receipt.target.objectKey === this.objectKey) {
          if (previous !== encoded)
            throw new Error(
              `Clone initialization incarnation changed: expected ${previous}, received ${encoded}`,
            );
          return;
        }
        if (receipt.target.objectKey !== input.source.objectKey) {
          throw new Error("Cloned storage belongs to a different source");
        }
      }
      this.initializeClonedStorage(input);
      // Readiness and worker claims belong to the source activation, not its copy.
      this.sql
        .exec(`DELETE FROM state WHERE key LIKE 'durable-work-ready-generation:%'
        OR key LIKE 'durable-work-ack-generation:%'
        OR key IN ('durable-work-active-worker', 'durable-work-active-activation')`);
      this.setStateValue("__objectKey", this.objectKey);
      this.setStateValue("__clonePreparation", encoded);
    });
  }

  protected async registerLifecycleRelease(detail?: unknown): Promise<void> {
    // Registration is the durable declaration that this activation owns
    // resources which must be released before replacement and reconstructed
    // afterwards. It is exact: a failed write fails the owning operation rather
    // than starting unregistered work or retrying behind its back.
    await this.workspaceStateService.lifecycleLeaseUpsert({
      ...this.lifecycleKey(),
      detail,
    });
  }

  protected async clearLifecycleRelease(): Promise<void> {
    await this.workspaceStateService.lifecycleLeaseClear(this.lifecycleKey());
  }

  // --- Hibernation hooks ---
  // On a resumed hibernated DO, workerd can invoke these on a fresh instance
  // WITHOUT going through fetch(), so schema must be ready here too.
  // Subclasses that override these MUST call super.webSocketMessage() etc.

  async webSocketMessage(
    _ws: WebSocket,
    _msg: string | ArrayBuffer,
  ): Promise<void> {
    await this.initializeSchema();
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    await this.initializeSchema();
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    await this.initializeSchema();
  }

  // --- Clone support ---

  protected resetRpcClients(): void {
    this._connectionless = null;
    this._credentials = null;
    this._notifications = null;
    this._fs = null;
    this._blobstore = null;
  }

  // --- Introspection ---

  async getState(): Promise<Record<string, unknown>> {
    const state = this.sql.exec(`SELECT * FROM state`).toArray();
    return { state, residentExecution: this.residentSessionDiagnostics() };
  }
}
