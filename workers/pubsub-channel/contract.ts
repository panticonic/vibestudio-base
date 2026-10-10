import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import { durableWorkOwnerMethods } from "@vibestudio/service-schemas/durableWorkOwner";
import {
  channelClientRpcMethods,
  type ChannelClientRpc,
} from "@workspace/pubsub/rpc-contract";
import type { PubSubChannel } from "./channel-do.js";

const clientContractCheck: ChannelClientRpc = {} as Pick<
  PubSubChannel,
  keyof ChannelClientRpc
>;
void clientContractCheck;

type WorkerOnlyRpc = Pick<
  PubSubChannel,
  | "executeChannelMaintenanceClaim"
  | "detach"
  | "adminUnsubscribeParticipant"
  | "adminUpdateParticipantMetadata"
  | "adminSetParticipantTypingState"
  | "initializeLockedChannel"
  | "adminInspectSchema"
  | "adminInspectLog"
  | "adminInspectEnvelope"
  | "adminReconstructTranscript"
  | "adminValidateLog"
  | "timeoutMethodCall"
  | "appendSeed"
  | "postClone"
  | "reportLineageHead"
  | "getLineageHeads"
  | "getState"
>;
const workerOnlyRpcMethods = createReceiverRpcMethods<WorkerOnlyRpc>([
  "executeChannelMaintenanceClaim",
  "detach",
  "adminUnsubscribeParticipant",
  "adminUpdateParticipantMetadata",
  "adminSetParticipantTypingState",
  "initializeLockedChannel",
  "adminInspectSchema",
  "adminInspectLog",
  "adminInspectEnvelope",
  "adminReconstructTranscript",
  "adminValidateLog",
  "timeoutMethodCall",
  "appendSeed",
  "postClone",
  "reportLineageHead",
  "getLineageHeads",
  "getState",
]);

export const channelRpcMethods = {
  ...channelClientRpcMethods,
  ...durableWorkOwnerMethods,
  ...workerOnlyRpcMethods,
};
