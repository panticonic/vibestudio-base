import { mainRpcMethod } from "@vibestudio/service-schemas/mainRpc";
import type { ApiKeyAuth, Provider } from "@panticonic/pi-ai";
import { builtinModels } from "@panticonic/pi-ai/providers/all";
import type { Context, JsonValue } from "@panticonic/pi-chord";
import { GenerationTask, LiveDoc } from "@panticonic/pi-durable";
import type {
  ConversationId,
  Harness,
  ModelRequestApi,
  ModelRequestPort,
  ModelRequestTarget,
  ModelRequestWait,
} from "@panticonic/pi-durable";
import {
  rpcErrorDataOf,
  type AcquisitionInfo,
  type RpcCaller,
} from "@vibestudio/rpc";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";
import { localModelRuntimeMethods } from "@vibestudio/service-schemas/localModelRuntime";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { resolveProviderModelBaseUrl } from "@vibestudio/shared/providerConnect";
import {
  TEST_MODEL_ID,
  TEST_MODEL_PROVIDER_ID,
} from "@workspace/model-catalog/catalog";
import { createDeterministicTestProvider } from "./deterministic-test-model.js";
import type { StoredCredentialSummary } from "@workspace/runtime/credentials";
import type { AuthorityInvocation } from "./native-authority-receipts.js";
import {
  retainedAgentExecutionOwner,
  type AgentExecutionOwner,
} from "./native-agent-session.js";
import {
  createCredentialedModelConnection,
  createLoopbackModelConnection,
} from "./native-model-transport.js";

import { isModelCredentialSentinel } from "./model-credential.js";
import { recordNativeWaitPresentation } from "./native-wait-presentation.js";

/** Resolve only the opaque credential supplied by the already admitted native model port. */
export function createProtectedModelAuth(): ApiKeyAuth {
  return {
    name: "Host-attested model access",
    async resolve({ credential, signal }) {
      signal.throwIfAborted();
      return typeof credential?.key === "string" &&
        isModelCredentialSentinel(credential.key)
        ? {
            auth: { apiKey: credential.key },
            source: "Host-attested model access",
          }
        : undefined;
    },
  };
}

/** Native provider APIs retain their implementation and catalog. Credential
 * resolution belongs to the protected request port, including OAuth providers. */
export function hostProtectedModelProvider(provider: Provider): Provider {
  return { ...provider, auth: { apiKey: createProtectedModelAuth() } };
}

export function createProtectedNativeModels(
  options: {
    readonly deterministicTestMode?: boolean;
    readonly modelScript?: unknown;
  } = {},
): ReturnType<typeof builtinModels> {
  const models = builtinModels();
  for (const provider of models.getProviders()) {
    models.setProvider(hostProtectedModelProvider(provider));
  }
  if (options.deterministicTestMode)
    models.setProvider(createDeterministicTestProvider(options.modelScript));
  return models;
}

const LOCAL_PROVIDER = "local";

/** The shipping owner supplies its actual host-authenticated task/trajectory boundary, never an inbound caller's authority. */
export interface NativeModelProviderHost {
  /** Exact test-only Pi provider enabled by the host only under TEST_MODE. */
  readonly deterministicTestProviderId?: string;
  readonly rpcForRequest: (
    request: ModelRequestTarget,
    api: ModelRequestApi,
    context: Context,
  ) =>
    | { rpc: RpcCaller; cleanupRpc: RpcCaller }
    | Promise<{ rpc: RpcCaller; cleanupRpc: RpcCaller }>;
  readonly egressFetch: typeof fetch;
  readonly waitForAuthority: (
    request: ModelRequestTarget,
    api: ModelRequestApi,
    acquisition: AcquisitionInfo,
    invocation: AuthorityInvocation,
    context: Context,
  ) => Promise<ModelRequestWait>;
}

/** One production port: original intent, protected preparation, effective endpoint, then attributed transport. */
export function createProtectedModelProvider(
  host: NativeModelProviderHost,
): ModelRequestPort {
  return async (request, api, context) => {
    context.abortSignal?.throwIfAborted();
    const onDiagnostic = (
      event: import("./native-model-transport.js").NativeModelTransportDiagnostic,
    ) =>
      console.info("[NativeModelTransport]", {
        taskId: request.taskId,
        conversationId: request.conversationId,
        attempt: request.attempt,
        purpose:
          request.purpose === "generation" || request.purpose === "compaction"
            ? request.purpose
            : "other",
        operation: request.operation,
        ...event,
      });
    const { rpc, cleanupRpc } = await host.rpcForRequest(request, api, context);
    context.abortSignal?.throwIfAborted();
    if (
      host.deterministicTestProviderId === TEST_MODEL_PROVIDER_ID &&
      request.model.provider === TEST_MODEL_PROVIDER_ID &&
      request.model.id === TEST_MODEL_ID
    ) {
      await api.prepare(request.model, context);
      context.abortSignal?.throwIfAborted();
      return {
        status: "ready",
        // Model generation tasks are handed off after every tool round. The
        // conversation is the stable Pi provider session across those tasks;
        // taskId changes after a tool result and would reset deterministic
        // test-model turn state on each generation.
        options: { sessionId: String(request.conversationId) },
        close: async () => {},
      };
    }
    async function invoke(
      service: string,
      method: string,
      args: JsonValue[],
    ): Promise<{ readonly value: unknown } | ModelRequestWait> {
      const invocation = { service, method, args };
      try {
        return {
          value: await rpc.call(
            "main",
            mainRpcMethod(`${service}.${method}`),
            args,
            {
              authorityAcquisition: "return",
              idempotencyKey: `model:${sha256HexSyncText(canonicalJson({ request, invocation }))}`,
              signal: context.abortSignal,
            },
          ),
        };
      } catch (error) {
        const acquisition = acquisitionInfo(error);
        if (!acquisition) throw error;
        return host.waitForAuthority(
          request,
          api,
          acquisition,
          invocation,
          context,
        );
      }
    }
    if (request.model.provider === LOCAL_PROVIDER) {
      const loaded = await invoke("localModelRuntime", "prepareNativeModel", [
        {
          providerId: request.model.provider,
          modelId: request.model.id,
          endpoint: request.model.baseUrl ?? null,
        },
      ]);
      if ("status" in loaded) return loaded;
      const localRuntime =
        localModelRuntimeMethods.prepareNativeModel.returns.parse(loaded.value);
      const prepared = await api.prepare(
        { ...request.model, baseUrl: localRuntime.baseUrl },
        context,
      );
      context.abortSignal?.throwIfAborted();
      return createLoopbackModelConnection(
        {
          model: prepared.model,
          egressFetch: host.egressFetch,
          onDiagnostic,
        },
        context,
      );
    }

    const resolveArgs: JsonValue[] = [
      {
        providerId: request.model.provider,
        modelId: request.model.id,
        endpoint: request.model.baseUrl ?? null,
      },
    ];
    async function resolve(): Promise<
      { readonly credential: StoredCredentialSummary | null } | ModelRequestWait
    > {
      const result = await invoke(
        "credentials",
        "resolveNativeModel",
        resolveArgs,
      );
      if ("status" in result) return result;
      return {
        credential: credentialsMethods.resolveNativeModel.returns.parse(
          result.value,
        ),
      };
    }
    let resolution = await resolve();
    if ("status" in resolution) return resolution;
    if (resolution.credential === null) {
      // Pin the actual current frontier, not the earlier model-context cutoff.
      // Connect always appends to the owned conversation, including while this task is still running.
      const after = await api.commit(async (tx) => {
        const latest = await tx.scanEntries(
          { conversationId: request.conversationId },
          1,
        );
        if (!latest.items[0])
          throw new Error(
            "Model credential wait has no owned conversation frontier",
          );
        return latest.items[0].id;
      }, context);
      // A successful connect preceding this frontier may otherwise be lost. Canonical resolution supplies readiness.
      resolution = await resolve();
      if ("status" in resolution) return resolution;
      if (resolution.credential === null) {
        const wait: ModelRequestWait = {
          status: "waiting",
          condition: {
            kind: "input",
            conversationId: request.conversationId,
            after,
            kinds: [credentialChangeKind(request.model.provider)],
          },
        };
        await api.commit(
          (tx) =>
            recordNativeWaitPresentation(tx, request.taskId, wait.condition, {
              reason: "model_credential_required",
              summary: "Waiting for model connection",
            }),
          context,
        );
        return wait;
      }
    }
    const credential = resolution.credential;
    const prepared = await api.prepare(
      {
        ...request.model,
        baseUrl: resolveProviderModelBaseUrl(
          request.model.provider,
          request.model.baseUrl,
          credential.metadata,
        ),
      },
      context,
    );
    context.abortSignal?.throwIfAborted();
    return createCredentialedModelConnection(
      {
        model: prepared.model,
        credential,
        rpc,
        cleanupRpc,
        egressFetch: host.egressFetch,
        onDiagnostic,
      },
      context,
    );
  };
}

/** Append an owner-authenticated checkup hint, never a credential/result. Return whether
 * it satisfies the current generation's credential wait, before scheduling resumes it. */
export async function notifyModelCredentialChange(
  harness: Harness,
  owner: AgentExecutionOwner,
  conversationId: ConversationId,
  providerId: string,
  context: Context,
): Promise<boolean> {
  const retained = await retainedAgentExecutionOwner(harness, context);
  if (canonicalJson(retained) !== canonicalJson(owner))
    throw new Error("Credential change belongs to a retired execution owner");
  const kind = credentialChangeKind(providerId);
  return harness.commit(async (tx) => {
    if (!(await tx.conversation(conversationId)))
      throw new Error("Credential change has no existing owned conversation");
    const live = await tx.doc(LiveDoc, conversationId);
    const task = live.run ? await tx.task(live.run.taskId) : undefined;
    const entry = await tx.appendEntry(conversationId, {
      kind,
      data: { providerId },
    });
    return Boolean(
      !live.run?.interruption &&
      task?.kind === GenerationTask.definition.name &&
      task.conversationId === conversationId &&
      !task.abortRequested &&
      task.state.status === "waiting" &&
      task.state.mode === "run" &&
      task.state.condition.kind === "input" &&
      task.state.condition.conversationId === conversationId &&
      task.state.condition.kinds.includes(kind) &&
      entry.id > task.state.condition.after,
    );
  }, context);
}

function credentialChangeKind(providerId: string): string {
  if (!providerId || providerId !== providerId.trim())
    throw new Error("Credential change requires an exact provider");
  return `vibestudio.model-credential-change:${providerId}`;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Only an explicitly structured acquisition from this exact protected invocation can park it. Malformed errors propagate unchanged. */
function acquisitionInfo(error: unknown): AcquisitionInfo | undefined {
  if (!object(error) || error["code"] !== "EACQUIRE") return undefined;
  const data = rpcErrorDataOf(error);
  const acquisition = object(data) ? data["acquisition"] : undefined;
  if (
    !object(acquisition) ||
    ![
      "acquisitionId",
      "ownerRuntimeId",
      "snapshotDigest",
      "capability",
      "resourceKey",
    ].every(
      (field) =>
        typeof acquisition[field] === "string" && acquisition[field] !== "",
    ) ||
    (acquisition["tier"] !== "gated" && acquisition["tier"] !== "critical") ||
    typeof acquisition["cardType"] !== "string" ||
    ![
      "permission.gated",
      "permission.outside",
      "confirm.critical",
      "task.rules",
      "template.add",
      "template.update",
      "template.remove",
      "template.suggest",
    ].includes(acquisition["cardType"]) ||
    typeof acquisition["renderedAction"] !== "string" ||
    typeof acquisition["pending"] !== "boolean" ||
    (acquisition["existingReview"] !== undefined &&
      (!object(acquisition["existingReview"]) ||
        typeof acquisition["existingReview"]["approvalId"] !== "string" ||
        !acquisition["existingReview"]["approvalId"] ||
        typeof acquisition["existingReview"]["title"] !== "string" ||
        !acquisition["existingReview"]["title"]))
  )
    return undefined;
  return acquisition as unknown as AcquisitionInfo;
}
