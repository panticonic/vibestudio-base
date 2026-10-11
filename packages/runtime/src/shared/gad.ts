import type { RpcMethodArgs } from "@vibestudio/shared/rpcMethods";
import { resolveDurableObjectService } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { createLazyTypedRpcServiceClient } from "@vibestudio/shared/typedRpcServiceClient";

import type { RpcCaller } from "@vibestudio/rpc";
import type { gadRpcMethods } from "@vibestudio/service-schemas/clients/gadServiceClient";
import type { DurableObjectServiceClient } from "@vibestudio/shared/workspaceServiceRpc";


import {
  type TypedServiceClient,
} from "@vibestudio/shared/typedServiceClient";
import { createLazyTypedServiceClient } from "@vibestudio/shared/lazyTypedServiceClient";
import { type gadMethods, type gadWireMethods, type EnvelopeLineage } from "@vibestudio/service-schemas/workspaceSource";
import {
  BLOBSTORE_METHOD_NAMES,
  GAD_METHOD_NAMES,
} from "@vibestudio/service-schemas/clients/generated/runtimeClientMethods";
import { collectChannelEnvelopePages } from "@vibestudio/shared/channelEnvelopePaging";


import { hydrateStoredValueRefs } from "@workspace/agentic-protocol/stored-values";


export { GAD_WORKSPACE_SERVICE_PROTOCOL } from "@vibestudio/shared/workspaceServiceRpc";
export type * from "@vibestudio/service-schemas/workspaceSource";

const CHANNEL_SERVICE_PROTOCOL = "vibestudio.channel.v1";

/** Typed from the shared GAD runtime method schemas, plus the runtime-only
 * cursor follower for `readChannelEnvelopes`/`inspectChannelEnvelopes`. */
export type GadClient = TypedServiceClient<typeof gadMethods> & {
  collectChannelEnvelopePages: typeof collectChannelEnvelopePages;
};

export function createGadClient(rpc: RpcCaller): GadClient {
  let servicePromise:
    | Promise<DurableObjectServiceClient<typeof gadRpcMethods>>
    | undefined;
  const service = () =>
    (servicePromise ??= import(
      "@vibestudio/service-schemas/clients/gadServiceClient"
    ).then(({ createGadServiceClient }) => createGadServiceClient(rpc)));
  const call = <K extends keyof typeof gadWireMethods & string>(
    method: K,
    ...args: RpcMethodArgs<(typeof gadRpcMethods)[K]>
  ) => service().then((client) => client.call(method, ...args));
  const blobstore = createLazyTypedRpcServiceClient(rpc, { targetId: "main", namespace: "blobstore" }, BLOBSTORE_METHOD_NAMES, async () =>
      (await import("@vibestudio/service-schemas/blobstore")).blobstoreMethods);
  const hydrate = async <T>(value: T): Promise<T> =>
    hydrateStoredValueRefs(value, {
      getText: (digest) => blobstore.getText(digest),
    }) as Promise<T>;
  const hydrateLineage = async (
    item: EnvelopeLineage,
  ): Promise<EnvelopeLineage> => ({
    ...item,
    envelope: await hydrate(item.envelope),
    trajectoryEvent: await hydrate(item.trajectoryEvent),
  });

  const adapter: TypedServiceClient<typeof gadMethods> = {
    status: () => call("getStatus"),
    ensureBlob: (hash, size, mimeType) =>
      call("ensureBlob", hash, size, mimeType),
    listUserNotificationsForMe: async (input) =>
      (
        await call(
          "listUserNotificationsForMe",
          ...(input ? [input] : []),
        )
      ).notifications,
    acknowledgeUserNotification: async (id) =>
      (
        await call(
          "acknowledgeUserNotification",
          {
            id,
          },
        )
      ).acknowledged,
    putUserNotification: (input) =>
      call("putUserNotification", input),
    deleteUserNotification: async (userId, id) =>
      (
        await call("deleteUserNotification", {
          userId,
          id,
        })
      ).deleted,
    getTrajectoryBranchHead: (input) => call("getTrajectoryBranchHead", input),
    listTrajectoryBranches: (input) => call("listTrajectoryBranches", input),
    listTrajectoryInvocations: (input) =>
      call("listTrajectoryInvocations", input),
    listTrajectoryApprovals: (input) => call("listTrajectoryApprovals", input),
    listChannelEnvelopes: (input) => call("listChannelEnvelopes", input),
    listTrajectoryEvents: async (input) =>
      Promise.all(
        (await call("listTrajectoryEvents", input)).map(
          (event) => hydrate(event),
        ),
      ),
    appendChannelEnvelope: (input) =>
      call("appendChannelEnvelope", input).then(hydrate),
    listMessageTypes: (input) => call("listMessageTypes", input),
    getMessageType: (input) => call("getMessageType", input),
    getChannelEnvelope: (input) =>
      call("getChannelEnvelope", input).then((value) =>
        value ? hydrate(value) : null,
      ),
    getTrajectoryForEnvelope: (input) =>
      call("getTrajectoryForEnvelope", input).then(
        (value) => (value ? hydrateLineage(value) : null),
      ),
    resolveTrajectoryForkPoint: (input) =>
      call("resolveTrajectoryForkPoint", input),
    listPublishedEnvelopesForTrajectory: async (input) =>
      Promise.all(
        (
          await call(
            "listPublishedEnvelopesForTrajectory",
            input,
          )
        ).map(hydrateLineage),
      ),
    getEnvelopesForTrajectory: async (input) =>
      Promise.all(
        (await call("getEnvelopesForTrajectory", input)).map(
          hydrateLineage,
        ),
      ),
    getPublishedArtifactsForTurn: async (input) =>
      Promise.all(
        (
          await call("getPublishedArtifactsForTurn", input)
        ).map(async (item) => ({
          ...item,
          lineage: await hydrateLineage(item.lineage),
        })),
      ),
    getPrivateLineageForPublishedEnvelope: async (input) => {
      const value = await call(
        "getPrivateLineageForPublishedEnvelope",
        input,
      );
      return value
        ? {
            ...value,
            lineage: await hydrateLineage(value.lineage),
            branchEvents: await Promise.all(
              value.branchEvents.map((event) => hydrate(event)),
            ),
          }
        : null;
    },
    getDownstreamConsumers: async (input) =>
      Promise.all(
        (await call("getDownstreamConsumers", input)).map(
          (event) => hydrate(event),
        ),
      ),
    readChannelEnvelopes: async (input) => {
      const page = await call(
        "readChannelEnvelopes",
        input,
      );
      return {
        ...page,
        items: await Promise.all(
          page.items.map((envelope) => hydrate(envelope)),
        ),
      };
    },
    inspectChannelEnvelopes: (input) => call("inspectChannelEnvelopes", input),
    listStoredValueRefs: (input) => call("listStoredValueRefs", input ?? {}),
    inspectStorageDiagnostics: (input) =>
      call("inspectStorageDiagnostics", input ?? {}),
    inspectPublicationIntegrity: (input) =>
      call("inspectPublicationIntegrity", input ?? {}),
    inspectTurnState: (input) => call("inspectTurnState", input ?? {}),
    inspectInvocationState: (input) =>
      call("inspectInvocationState", input ?? {}),
    diagnoseInvocation: (input) => call("diagnoseInvocation", input),
    inspectChannelRoster: (input) => call("inspectChannelRoster", input),
    inspectAgentHealth: (input) => call("inspectAgentHealth", input),
    // The channel DO owns inspection and its channel.admin gate; resolve it
    // and call it under this caller's own authority.
    inspectAgent: async ({ channelId, ...request }) => {
      const channel = await resolveDurableObjectService(rpc, CHANNEL_SERVICE_PROTOCOL, channelId);
      if (channel.kind !== "durable-object") {
        throw new Error(
          `gad.inspectAgent: channel service resolved to a ${channel.kind}`,
        );
      }
      return rpc.call(channel.targetId, channelClientRpcMethods["inspectAgent"], [
        request,
      ]);
    },
    listAgentDirectory: (input) => call("listAgentDirectory", input ?? {}),
    searchAgentDirectory: (input) => call("searchAgentDirectory", input),
    describeChannels: (input) => call("describeChannels", input ?? {}),
    validateGadHashes: (input) => call("validateGadHashes", input),
    clearDirtyAfterValidation: (input) =>
      call("clearDirtyAfterValidation", input),
    checkGadIntegrity: (input) => call("checkGadIntegrity", input),
    rebuildTrajectoryProjections: (input) =>
      call("rebuildTrajectoryProjections", input),
  };

  const client = createLazyTypedServiceClient(
    "gad",
    GAD_METHOD_NAMES,
    async () =>
      (await import("@vibestudio/service-schemas/workspaceSource")).gadMethods,
    (_service, method, args) => {
      const member = (adapter as unknown as Record<string, unknown>)[method];
      if (typeof member !== "function") {
        throw new Error(
          `GAD public adapter has no method ${JSON.stringify(method)}`,
        );
      }
      return (member as (...values: unknown[]) => Promise<unknown>)(...args);
    },
  );
  return Object.assign(client, { collectChannelEnvelopePages });
}
