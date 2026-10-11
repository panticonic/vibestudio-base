import {
  createReceiverRpcMethods,
  type RpcMethodArgs,
  type RpcMethodResult,
} from "@vibestudio/shared/rpcMethods";
import {
  agentRpcMethods as clientAgentRpcMethods,
  type AgentRpcClientMethods,
} from "@workspace/agentic-core/rpc-contract";
import { evalOwnerCallbackRpcMethods } from "@vibestudio/service-schemas/eval";
import type { AgentWorkerBase } from "./agent-worker-base.js";

type Receiver = Pick<
  AgentWorkerBase,
  | "inspectNativeInvocationSource"
  | "onAuthorityChanged"
  | "onEvalComplete"
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
  | "initializeAutomation"
  | "onEvalProgress"
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
type EvalOwnerCallbackNames = keyof typeof evalOwnerCallbackRpcMethods;
type AdditionalReceiver = Omit<
  Receiver,
  keyof AgentRpcClientMethods | EvalOwnerCallbackNames
>;

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

export const agentRpcMethods = {
  ...clientAgentRpcMethods,
  ...evalOwnerCallbackRpcMethods,
  ...additionalAgentRpcMethods,
};

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type EvalOwnerCallbacks = Pick<AgentWorkerBase, EvalOwnerCallbackNames>;
type EvalOwnerCallbackContractChecks = {
  [Method in EvalOwnerCallbackNames]: Equal<
    [
      Parameters<EvalOwnerCallbacks[Method]>,
      Awaited<ReturnType<EvalOwnerCallbacks[Method]>>,
    ],
    [
      RpcMethodArgs<(typeof evalOwnerCallbackRpcMethods)[Method]>,
      RpcMethodResult<(typeof evalOwnerCallbackRpcMethods)[Method]>,
    ]
  >;
};

export type AgentRpcClientContractCheck = Assert<
  Pick<Receiver, keyof AgentRpcClientMethods> extends AgentRpcClientMethods
    ? true
    : false
>;
export type AgentEvalCallbackContractCheck = Assert<
  EvalOwnerCallbackContractChecks[EvalOwnerCallbackNames]
>;
