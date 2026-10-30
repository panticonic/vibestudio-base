import type { Api, Model } from "@panticonic/pi-ai";
import type { Context, JsonValue } from "@panticonic/pi-chord";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  defineExtension,
  type Harness,
  type ModelRequestApi,
  type ModelRequestConnection,
  type ModelRequestTarget,
} from "@panticonic/pi-durable";
import { rpc } from "@vibestudio/rpc";
import { nativeTurnOptions } from "./toolChoice.js";
import { createDurableObjectServiceClient } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import {
  NativeAgentOwner,
  type NativeAgentOptions,
} from "@workspace/agentic-do/native-agent-owner";
import {
  bindNativeModelInvocation,
  type NativeInvocationBoundary,
} from "@workspace/agentic-do/native-invocation-boundary";
import {
  NativeModelHelperTask,
  completeNativeModelHelper,
} from "@workspace/agentic-do/native-model-helper";
import {
  observeNativeModelConnection,
  prepareNativeModelEvidence,
  readNativeModelExecutionEvidence,
} from "@workspace/agentic-do/native-model-evidence";
import {
  createLocalNativeModelProvider,
  createProtectedNativeModelsForEnv,
  hostProtectedModelProvider,
} from "@workspace/agentic-do/native-model-provider";
import { createNativeModelRequestPort } from "@workspace/agentic-do/native-model-request-port";
import {
  LOCAL_PROVIDER_ID,
  MODEL_SETTINGS_SERVICE_PROTOCOL,
  isModelUsable,
  type ModelCatalogEntry,
} from "@workspace/model-catalog/catalog";
import { isModelRole } from "@workspace/model-catalog/modelRoles";
import { modelSettingsRpcMethods } from "@workspace/model-catalog/rpc-contract";
import {
  modelGatewayTurnInputSchema,
  type ModelGatewayAttribution,
  type ModelGatewayCancelResult,
  type ModelGatewayRpc,
  type ModelGatewayTurnInput,
  type ModelGatewayTurnResult,
} from "@workspace/model-gateway/contract";
import type {
  LifecyclePrepareInput,
} from "@workspace/runtime/worker/durable-base";

/** Cancellation requested through `cancel`: a terminal outcome of the turn, not a failure. */
class TurnCancelled extends Error {
  constructor(turnId: string) {
    super(`Model turn ${turnId} was cancelled`);
    this.name = "TurnCancelled";
  }
}

interface PendingTurn {
  readonly controller: AbortController;
  readonly operation: Promise<ModelGatewayTurnResult>;
}

const WEBSITE_CLOSED = {
  kind: "closed",
  reason:
    "Model turns spend the user's model accounts; they are not exposed to websites.",
} as const;

/**
 * The model gateway: one model turn, for an authorized caller, as a native Pi
 * task through the protected model request port. Credentials are injected at
 * host egress exactly as for agent generation; this worker never sees them.
 *
 * It is a native owner with no agent channel, so its invocations are attributed
 * to its own trajectory (named by its runtime id), and the host's native model
 * gate (model.use, credential.use) applies to each turn unchanged.
 */
export class ModelGatewayDO
  extends NativeAgentOwner
  implements ModelGatewayRpc
{
  private readonly registry = (() => {
    const registry = createRegistry();
    registry.install(
      defineExtension({
        name: "vibestudio.model-gateway",
        tasks: [NativeModelHelperTask],
      }),
    );
    return registry;
  })();
  private readonly models = createProtectedNativeModelsForEnv(this.env);
  private readonly turns = new Map<string, PendingTurn>();

  protected override nativeTrajectory() {
    return async () => this.rpcSelfId;
  }

  protected agentOptions(): NativeAgentOptions {
    return {
      models: this.models,
      registry: this.registry,
      prepareCommit: prepareNativeModelEvidence,
      modelRequests: createNativeModelRequestPort({
        deterministicTestMode: this.env["VIBESTUDIO_TEST_MODE"] === "1",
        bindExecution: (request, api, context) =>
          bindNativeModelInvocation(
            this.invocationBoundary(this.admittedAgentSession()),
            request,
            api,
            context,
          ),
        waitForAuthority: (request, api, info, invocation, context) =>
          this.waitForAgentAuthority(request, api, info, invocation, context),
        observe: (request, api, connection, context) =>
          this.observeModelConnection(request, api, connection, context),
      }),
    };
  }

  /** Native model evidence of the prepared provider payload. */
  protected observeModelConnection(
    request: ModelRequestTarget,
    api: ModelRequestApi,
    connection: ModelRequestConnection,
    context: Context,
  ): Promise<ModelRequestConnection> {
    return observeNativeModelConnection(request, api, connection, context);
  }

  /** No channel publishes this owner's invocations: attribution is the evidence. */
  private invocationBoundary(harness: Harness): NativeInvocationBoundary {
    return {
      harness,
      image: this.loadedImage(),
      rpc: this.agentExecutionRpc,
    };
  }

  protected modelSettings() {
    return createDurableObjectServiceClient(
      this.rpc,
      MODEL_SETTINGS_SERVICE_PROTOCOL,
      modelSettingsRpcMethods,
    );
  }

  /** The caller as the host authenticated it. An agent's eval is attributed to
   * its owning agent; panels and users attribute to themselves. */
  protected attribution(): ModelGatewayAttribution {
    const caller = this.caller;
    if (!caller) throw new Error("Model turns require an authenticated caller");
    const agent = this.authorization?.agentBinding?.entity;
    return {
      callerId: caller.callerId,
      callerKind: caller.callerKind,
      ...(agent ? { agentId: agent.slice("entity:".length) } : {}),
      ...(caller.userId ? { userId: caller.userId } : {}),
    };
  }

  private async resolveModel(
    requested: string,
  ): Promise<{ entry: ModelCatalogEntry; role?: string }> {
    const settings = this.modelSettings();
    if (isModelRole(requested)) {
      const resolution = await settings.call("resolveRole", requested);
      if (!resolution.model) throw new Error(resolution.reason);
      return { entry: resolution.model, role: requested };
    }
    const entry = await settings.call("getModel", requested);
    if (!entry) throw new Error(`Unknown model ${JSON.stringify(requested)}`);
    if (!isModelUsable(entry))
      throw new Error(
        `Model ${entry.ref} is not available (${entry.availability.state}); connect its provider first`,
      );
    return { entry };
  }

  /** The native Pi descriptor of a catalog entry. Local entries carry their own
   * live endpoint, so the local provider is refreshed from the entry per turn. */
  private nativeModel(entry: ModelCatalogEntry): Model<Api> {
    if (entry.provider === LOCAL_PROVIDER_ID)
      this.models.setProvider(
        hostProtectedModelProvider(
          createLocalNativeModelProvider([
            { spec: entry.modelSpec, toolsCapable: entry.capabilities.tools },
          ]),
        ),
      );
    const model = this.models.getModel(entry.provider, entry.id);
    if (!model)
      throw new Error(`Native provider does not contain model ${entry.ref}`);
    return model;
  }

  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async turn(input: ModelGatewayTurnInput): Promise<ModelGatewayTurnResult> {
    await this.agentSession();
    this.assertNativeAgentAdmission();
    const checked = modelGatewayTurnInputSchema.parse(input) as unknown as ModelGatewayTurnInput;
    const attribution = this.attribution();
    const key = `${attribution.callerId}\u0000${checked.turnId}`;
    if (this.turns.has(key))
      throw new Error(`Model turn ${checked.turnId} is already pending`);
    const inbound = this.rpcAbortSignal;
    const controller = new AbortController();
    // The caller leaving ends the turn it is waiting for.
    const onInbound = () => controller.abort(inbound?.reason);
    inbound?.addEventListener("abort", onInbound, { once: true });
    if (inbound?.aborted) onInbound();
    const operation = this.runTurn(checked, attribution, controller);
    const pending = { controller, operation };
    this.turns.set(key, pending);
    try {
      return await operation;
    } finally {
      inbound?.removeEventListener("abort", onInbound);
      if (this.turns.get(key) === pending) this.turns.delete(key);
    }
  }

  private async runTurn(
    input: ModelGatewayTurnInput,
    attribution: ModelGatewayAttribution,
    controller: AbortController,
  ): Promise<ModelGatewayTurnResult> {
    const context = withAbortSignal(controller.signal, BACKGROUND_CONTEXT);
    try {
      const { entry, role } = await this.resolveModel(input.model);
      controller.signal.throwIfAborted();
      const model = this.nativeModel(entry);
      const harness = await this.agentSession(context);
      const root = await harness.root(context);
      const message = await completeNativeModelHelper(
        harness,
        root,
        model,
        input.context,
        nativeTurnOptions(model.api, input.options ?? {}),
        context,
        undefined,
        {
          turnId: input.turnId,
          requested: input.model,
          model: entry.ref,
          ...attribution,
        } as unknown as JsonValue,
      );
      return {
        status: "completed",
        turnId: input.turnId,
        message,
        model: entry.ref,
        ...(role ? { role } : {}),
        usage: message.usage,
        attribution,
      };
    } catch (error) {
      if (controller.signal.reason instanceof TurnCancelled)
        return { status: "cancelled", turnId: input.turnId };
      throw error;
    }
  }

  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user", "code", "session", "mission"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async cancel(input: { turnId: string }): Promise<ModelGatewayCancelResult> {
    const attribution = this.attribution();
    const pending = this.turns.get(`${attribution.callerId}\u0000${input.turnId}`);
    if (!pending) return { cancelled: false };
    pending.controller.abort(new TurnCancelled(input.turnId));
    // The turn settles as cancelled once its native task is aborted and joined.
    await pending.operation;
    return { cancelled: true };
  }

  /** Retained model-call evidence, with the attribution of each turn. */
  @rpc({
    website: WEBSITE_CLOSED,
    principals: ["host", "user"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async inspectTurns() {
    const harness = await this.agentSession();
    const root = await harness.root(BACKGROUND_CONTEXT);
    return readNativeModelExecutionEvidence(harness, root.id, BACKGROUND_CONTEXT);
  }

  protected async releaseAgentResources(
    _input: LifecyclePrepareInput,
    _harness: Harness,
  ): Promise<void> {
    const reason = new Error("Model gateway is retiring");
    const pending = [...this.turns.values()];
    for (const { controller } of pending) controller.abort(reason);
    const outcomes = await Promise.allSettled(pending.map((turn) => turn.operation));
    const failures = outcomes
      .filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected" && outcome.reason !== reason,
      )
      .map((outcome) => outcome.reason);
    if (failures.length)
      throw new AggregateError(failures, "Model gateway turn cleanup failed");
  }
}
