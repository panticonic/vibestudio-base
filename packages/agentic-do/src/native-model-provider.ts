import type { ApiKeyAuth, Provider } from "@panticonic/pi-ai";
import { builtinModels } from "@panticonic/pi-ai/providers/all";
import type { Context, JsonValue } from "@panticonic/pi-chord";
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
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { canonicalJson } from "@vibestudio/shared/canonicalJson";
import { resolveProviderModelBaseUrl } from "@vibestudio/shared/providerConnect";
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

export function createProtectedNativeModels(): ReturnType<
  typeof builtinModels
> {
  const models = builtinModels();
  for (const provider of models.getProviders()) {
    models.setProvider(hostProtectedModelProvider(provider));
  }
  return models;
}

const LOCAL_PROVIDER = "local";
const LOCAL_EXTENSION = "@workspace-extensions/local-models";

/** The shipping owner supplies its actual host-authenticated task/trajectory boundary, never an inbound caller's authority. */
export interface NativeModelProviderHost {
  readonly notifyCredentialMissing?: (
    request: ModelRequestTarget,
    api: ModelRequestApi,
    context: Context,
  ) => Promise<void>;
  readonly rpcForRequest: (
    request: ModelRequestTarget,
    api: ModelRequestApi,
    context: Context,
  ) => RpcCaller | Promise<RpcCaller>;
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
    const rpc = await host.rpcForRequest(request, api, context);
    context.abortSignal?.throwIfAborted();
    async function invoke(
      service: string,
      method: string,
      args: JsonValue[],
    ): Promise<{ readonly value: unknown } | ModelRequestWait> {
      const invocation = { service, method, args };
      try {
        return {
          value: await rpc.call<unknown>("main", `${service}.${method}`, args, {
            authorityAcquisition: "return",
            idempotencyKey: `model:${sha256HexSyncText(canonicalJson({ request, invocation }))}`,
            signal: context.abortSignal,
          }),
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
      const loaded = await invoke("extensions", "invoke", [
        LOCAL_EXTENSION,
        "ensureLoaded",
        [request.model.id],
      ]);
      if ("status" in loaded) return loaded;
      if (!object(loaded.value) || typeof loaded.value["baseUrl"] !== "string")
        throw new Error("Local model provider returned no concrete endpoint");
      const prepared = await api.prepare(
        { ...request.model, baseUrl: loaded.value["baseUrl"] },
        context,
      );
      const authorized = await invoke("extensions", "invoke", [
        LOCAL_EXTENSION,
        "getLoopbackAuth",
        [],
      ]);
      if ("status" in authorized) return authorized;
      const auth = authorized.value;
      if (
        !object(auth) ||
        typeof auth["apiKey"] !== "string" ||
        !Array.isArray(auth["origins"]) ||
        !auth["origins"].every(
          (origin): origin is string => typeof origin === "string",
        )
      )
        throw new Error(
          "Local model provider returned no endpoint attestation",
        );
      context.abortSignal?.throwIfAborted();
      return createLoopbackModelConnection(
        {
          model: prepared.model,
          apiKey: auth["apiKey"],
          origins: auth["origins"],
          egressFetch: host.egressFetch,
          onDiagnostic,
        },
        context,
      );
    }

    const resolveArgs: JsonValue[] = [
      {
        ...(!request.model.baseUrl || /\{[^}]+\}/.test(request.model.baseUrl)
          ? { providerId: request.model.provider }
          : { url: request.model.baseUrl }),
      },
    ];
    async function resolve(): Promise<
      { readonly credential: StoredCredentialSummary | null } | ModelRequestWait
    > {
      const result = await invoke(
        "credentials",
        "resolveCredential",
        resolveArgs,
      );
      if ("status" in result) return result;
      return {
        credential: credentialsMethods.resolveCredential.returns.parse(
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
        await host.notifyCredentialMissing?.(request, api, context);
        return {
          status: "waiting",
          condition: {
            kind: "input",
            conversationId: request.conversationId,
            after,
            kinds: [credentialChangeKind(request.model.provider)],
          },
        };
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
        egressFetch: host.egressFetch,
        onDiagnostic,
      },
      context,
    );
  };
}

/** Called by the authenticated owner only after credentials.connect succeeds. This is a checkup hint, never a credential/result. */
export async function notifyModelCredentialChange(
  harness: Harness,
  owner: AgentExecutionOwner,
  conversationId: ConversationId,
  providerId: string,
  context: Context,
): Promise<void> {
  const retained = await retainedAgentExecutionOwner(harness, context);
  if (canonicalJson(retained) !== canonicalJson(owner))
    throw new Error("Credential change belongs to a retired execution owner");
  const kind = credentialChangeKind(providerId);
  await harness.commit(async (tx) => {
    if (!(await tx.conversation(conversationId)))
      throw new Error("Credential change has no existing owned conversation");
    await tx.appendEntry(conversationId, { kind, data: { providerId } });
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
    typeof acquisition["pending"] !== "boolean"
  )
    return undefined;
  return acquisition as unknown as AcquisitionInfo;
}
