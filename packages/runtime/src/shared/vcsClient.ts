/** Canonical runtime client for the deliberately small semantic VCS API. */

import {
  type vcsMethods,
  type VcsStatusInput,
  type VcsStatusResult,
} from "@vibestudio/service-schemas/vcs";
import { type TypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { createLazyTypedServiceClient } from "@vibestudio/shared/lazyTypedServiceClient";
import {
  COMMAND_BOUND_METHOD_NAMES,
  VCS_METHOD_NAMES,
} from "@vibestudio/service-schemas/clients/generated/runtimeClientMethods";
import { bindContextArgs } from "@vibestudio/service-schemas/clients/contextBinding";
import { publishContext, type VcsPublishInput, type VcsPublishResult } from "./vcsPublish.js";

export type * from "@vibestudio/service-schemas/vcs";
export type {
  VcsIntegrationRequired,
  VcsPublished,
  VcsPublishInput,
  VcsPublishResult,
} from "./vcsPublish.js";

/**
 * Runtime code uses the service contract directly. There are no alternate
 * merge verbs, selective-commit compilers, provenance facades, or routing
 * overlays to keep synchronized with it.
 */
type SchemaVcsClient = TypedServiceClient<typeof vcsMethods>;
type ReferencedMethodName<Reference> = {
  [Method in keyof typeof vcsMethods]: Extract<
    (typeof vcsMethods)[Method]["references"][number],
    Reference
  > extends never
    ? never
    : Method;
}[keyof typeof vcsMethods];
type ContextBoundMethodName = ReferencedMethodName<{
  kind: "context";
  path: readonly ["contextId"];
}>;
type CommandBoundMethodName = ReferencedMethodName<{
  kind: "command";
  path: readonly ["commandId"];
}>;
type DistributiveOmit<Value, Key extends PropertyKey> = Value extends unknown
  ? Omit<Value, Key>
  : never;
type OptionalFieldsMethod<Method, Key extends string> = Method extends (
  input: infer Input
) => Promise<infer Result>
  ? (input: DistributiveOmit<Input, Key> & { [Field in Key]?: string }) => Promise<Result>
  : Method;
type ContextBoundStatusInput = Omit<VcsStatusInput, "contextId"> & { contextId?: string };

type BoundVcsClient = {
  [Method in keyof SchemaVcsClient]: Method extends CommandBoundMethodName
    ? OptionalFieldsMethod<
        SchemaVcsClient[Method],
        Method extends ContextBoundMethodName ? "contextId" | "commandId" : "commandId"
      >
    : Method extends ContextBoundMethodName
      ? OptionalFieldsMethod<SchemaVcsClient[Method], "contextId">
      : SchemaVcsClient[Method];
};

export type VcsClient = Omit<BoundVcsClient, "status"> & {
  status(input?: ContextBoundStatusInput): Promise<VcsStatusResult>;
  /** Commit any uncommitted chain and push it; never merges a moved main. */
  publish(input?: VcsPublishInput): Promise<VcsPublishResult>;
};

const commandBoundMethods = new Set<string>(COMMAND_BOUND_METHOD_NAMES.vcs);

/**
 * One logical call is one semantic command. The client mints its identity
 * before the first transport attempt, so only its own transport retries reuse
 * it; every new call is a new command. An explicit caller-supplied
 * `commandId` (a provenance node, e.g. a bound tool invocation) always wins.
 */
function bindCommandInput(method: string, input: unknown): unknown {
  if (!commandBoundMethods.has(method)) return input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const { commandId, ...rest } = input as { commandId?: unknown };
  return { ...rest, commandId: commandId ?? crypto.randomUUID() };
}

export function createVcsClient(
  callMain: <T>(method: string, ...args: unknown[]) => Promise<T>,
  boundContextId: string
): VcsClient {
  const schemaClient = createLazyTypedServiceClient(
    "vcs",
    VCS_METHOD_NAMES,
    async () => (await import("@vibestudio/service-schemas/vcs")).vcsMethods,
    (_service, method, args) => callMain(`vcs.${method}`, ...args)
  );
  const client = Object.fromEntries(
    Object.entries(schemaClient).map(([method, invoke]) => [
      method,
      (...args: unknown[]) => {
        const boundArgs = bindContextArgs("vcs", method, args, boundContextId);
        if (boundArgs.length > 0) {
          boundArgs[0] = bindCommandInput(method, boundArgs[0]);
        }
        return (invoke as (...values: unknown[]) => Promise<unknown>)(...boundArgs);
      },
    ])
  ) as Omit<VcsClient, "publish">;
  return {
    ...client,
    publish: (input = {}) =>
      publishContext(client, { ...input, contextId: input.contextId ?? boundContextId }),
  };
}
