import { mainRpcMethod } from "@vibestudio/service-schemas/mainRpc";
import type { Api, Model } from "@panticonic/pi-ai";
import {
  copyJson,
  type Context,
  type JsonRepresentation,
} from "@panticonic/pi-chord";
import type { RpcCaller } from "@vibestudio/rpc";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";
import { resolveProviderModelBaseUrl } from "@vibestudio/shared/providerConnect";
import {
  createCredentialedModelConnection,
  createLoopbackModelConnection,
  type CredentialedModelConnection,
} from "./native-model-transport.js";

/** The real one-shot method/tool caller owns admission and cancellation. This helper does not manufacture a native model task. */
export interface NativePreparedModelHelperHost {
  rpc: RpcCaller;
  egressFetch: typeof fetch;
  credentialMissing?(model: Model<Api>, context: Context): Promise<void>;
  own?(connection: CredentialedModelConnection): void;
  released?(connection: CredentialedModelConnection): void;
}

export class NativeModelCredentialMissing extends Error {
  readonly code = "MODEL_CREDENTIAL_MISSING";
  constructor(readonly providerId: string) {
    super(`No model credential configured for ${providerId}`);
    this.name = "NativeModelCredentialMissing";
  }
}

/** Prepare one selected model using protected host facts, dispatch with its exact transport, and join cleanup. */
export async function withPreparedNativeModel<T>(
  host: NativePreparedModelHelperHost,
  selected: Model<Api>,
  dispatch: (
    model: Model<Api>,
    connection: CredentialedModelConnection,
  ) => Promise<T>,
  context: Context,
): Promise<T> {
  const original = copyJson(selected, {
    omitUndefinedProperties: true,
  }) as JsonRepresentation<Model<Api>>;
  context.abortSignal?.throwIfAborted();
  const invoke = (method: string, args: unknown[]) => {
    context.abortSignal?.throwIfAborted();
    return host.rpc.call("main", mainRpcMethod(method), args, {
      signal: context.abortSignal,
      authorityAcquisition: "wait",
    });
  };
  let model: JsonRepresentation<Model<Api>> = original;
  let connection: CredentialedModelConnection;
  if (model.provider === "local") {
    const loaded = await invoke("extensions.invoke", [
      "@workspace-extensions/local-models",
      "ensureLoaded",
      [model.id],
    ]);
    if (!object(loaded) || typeof loaded["baseUrl"] !== "string")
      throw new Error("Local model helper returned no concrete endpoint");
    model = { ...model, baseUrl: loaded["baseUrl"] };
    const auth = await invoke("extensions.invoke", [
      "@workspace-extensions/local-models",
      "getLoopbackAuth",
      [],
    ]);
    if (
      !object(auth) ||
      typeof auth["apiKey"] !== "string" ||
      !Array.isArray(auth["origins"]) ||
      !auth["origins"].every(
        (value): value is string => typeof value === "string",
      )
    )
      throw new Error("Local model helper returned no endpoint attestation");
    context.abortSignal?.throwIfAborted();
    connection = createLoopbackModelConnection(
      {
        model,
        apiKey: auth["apiKey"],
        origins: auth["origins"],
        egressFetch: host.egressFetch,
      },
      context,
    );
  } else {
    const credential = credentialsMethods.resolveCredential.returns.parse(
      await invoke("credentials.resolveCredential", [
        !model.baseUrl || /\{[^}]+\}/.test(model.baseUrl)
          ? { providerId: model.provider }
          : { url: model.baseUrl },
      ]),
    );
    if (credential === null) {
      await host.credentialMissing?.(model, context);
      throw new NativeModelCredentialMissing(model.provider);
    }
    model = {
      ...model,
      baseUrl: resolveProviderModelBaseUrl(
        model.provider,
        model.baseUrl,
        credential.metadata,
      ),
    };
    context.abortSignal?.throwIfAborted();
    connection = createCredentialedModelConnection(
      { model, credential, rpc: host.rpc, egressFetch: host.egressFetch },
      context,
    );
  }
  let value: T;
  try {
    host.own?.(connection);
    value = await dispatch(model, connection);
  } catch (error) {
    try {
      await connection.close(context);
      host.released?.(connection);
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Model helper failed and its transport cleanup failed",
        { cause: error },
      );
    }
    throw error;
  }
  await connection.close(context);
  host.released?.(connection);
  return value;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
