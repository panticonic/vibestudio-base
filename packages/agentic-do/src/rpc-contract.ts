import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import {
  agentRpcMethods as clientAgentRpcMethods,
  type AgentRpcClientMethods,
} from "@workspace/agentic-core/rpc-contract";
import type { AgentWorkerBase } from "./agent-worker-base.js";

type Receiver = Pick<
  AgentWorkerBase,
  | "inspectNativeInvocationSource"
  | "onAuthorityChanged"
  | "getAgentSettings"
  | "subscribeChannel"
  | "runAutomationTurn"
  | "runAutomationEval"
  | "runAutomationTool"
  | "describeAutomationRun"
  | "acknowledgeAutomationRun"
  | "unsubscribeChannel"
  | "acceptChannelDelivery"
  | "onMethodCall"
  | "cancelDirectMethodCall"
  | "readAgentInspection"
  | "getModelExecutionEvidence"
  | "interruptChannel"
  | "interruptAllChannels"
  | "chatOp"
  | "describeEvalOwner"
  | "listEvalAddressees"
  | "observeOutsideContent"
  | "initializeAutomation"
  | "canFork"
  | "exportChannelKnowledge"
  | "importChannelKnowledge"
  | "cancelSubagentExecution"
  | "readSubagentExecutionActivity"
  | "retireSubagentExecution"
  | "waitForNativeRun"
  | "readSubagentInputSettlement"
  | "onSubagentInputSettled"
>;
type AdditionalReceiver = Omit<Receiver, keyof AgentRpcClientMethods>;

const additionalAgentRpcMethods = createReceiverRpcMethods<AdditionalReceiver>([
  "inspectNativeInvocationSource",
  "onAuthorityChanged",
  "getAgentSettings",
  "runAutomationTurn",
  "runAutomationEval",
  "runAutomationTool",
  "describeAutomationRun",
  "acknowledgeAutomationRun",
  "acceptChannelDelivery",
  "onMethodCall",
  "cancelDirectMethodCall",
  "readAgentInspection",
  "getModelExecutionEvidence",
  "interruptChannel",
  "interruptAllChannels",
  "chatOp",
  "describeEvalOwner",
  "listEvalAddressees",
  "observeOutsideContent",
  "initializeAutomation",
  "canFork",
  "exportChannelKnowledge",
  "cancelSubagentExecution",
  "readSubagentExecutionActivity",
  "retireSubagentExecution",
  "waitForNativeRun",
  "readSubagentInputSettlement",
  "onSubagentInputSettled",
]);

type Assert<T extends true> = T;

export const agentRpcMethods = {
  ...clientAgentRpcMethods,
  ...additionalAgentRpcMethods,
};

export type AgentRpcClientContractCheck = Assert<
  Pick<Receiver, keyof AgentRpcClientMethods> extends AgentRpcClientMethods
    ? true
    : false
>;
