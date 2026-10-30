import { TEST_MODEL_PROVIDER_ID } from "@workspace/model-catalog/catalog";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { Context } from "@panticonic/pi-chord";
import type {
  ModelRequestApi,
  ModelRequestConnection,
  ModelRequestPort,
  ModelRequestTarget,
} from "@panticonic/pi-durable";
import type { NativeInvocationExecution } from "./native-invocation-boundary.js";
import {
  createProtectedModelProvider,
  type NativeModelProviderHost,
} from "./native-model-provider.js";

/**
 * The one protected model request port. Every native owner that runs models
 * (agent vessels and the model gateway) composes this: original invocation
 * binding, protected credential preparation, evidence observation, and the
 * owner's own presentation of a streaming connection.
 */
export interface NativeModelRequestPortHost {
  readonly deterministicTestMode: boolean;
  /** Bind the original native invocation before any credential preparation. */
  readonly bindExecution: (
    request: ModelRequestTarget,
    api: ModelRequestApi,
    context: Context,
  ) => Promise<NativeInvocationExecution>;
  readonly waitForAuthority: NativeModelProviderHost["waitForAuthority"];
  /** Observe the prepared provider payload (native model evidence). */
  readonly observe: (
    request: ModelRequestTarget,
    api: ModelRequestApi,
    connection: ModelRequestConnection,
    context: Context,
  ) => Promise<ModelRequestConnection>;
  /** Present a streaming generation to the owner's audience. Owners with none omit it. */
  readonly present?: (
    request: ModelRequestTarget,
    connection: ModelRequestConnection,
    execution: NativeInvocationExecution,
    context: Context,
  ) => Promise<ModelRequestConnection>;
}

export function createNativeModelRequestPort(
  host: NativeModelRequestPortHost,
): ModelRequestPort {
  return async (request, api, context) => {
    const bound: { execution?: NativeInvocationExecution } = {};
    const connection = await createProtectedModelProvider({
      ...(host.deterministicTestMode
        ? { deterministicTestProviderId: TEST_MODEL_PROVIDER_ID }
        : {}),
      rpcForRequest: async (request, api, context) =>
        (bound.execution = await host.bindExecution(request, api, context)),
      egressFetch: fetch,
      waitForAuthority: host.waitForAuthority,
    })(request, api, context);
    if (connection.status !== "ready") return connection;
    let observed: ModelRequestConnection;
    try {
      observed = await host.observe(request, api, connection, context);
    } catch (error) {
      try {
        await connection.close(BACKGROUND_CONTEXT);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Native model observation and provider release failed",
          { cause: error },
        );
      }
      throw error;
    }
    if (
      !host.present ||
      request.purpose !== "generation" ||
      request.operation !== "stream"
    )
      return observed;
    try {
      if (!bound.execution)
        throw new Error("Ready native model has no original invocation binding");
      return await host.present(request, observed, bound.execution, context);
    } catch (error) {
      try {
        await observed.close(BACKGROUND_CONTEXT);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Native stream binding and provider release failed",
          { cause: error },
        );
      }
      throw error;
    }
  };
}
