/**
 * React adapter for the headless `DeferredAgentMachine` (first-agent setup and
 * the pre-send delivery queue). All flow logic lives in the machine; this hook
 * only feeds it the latest render's inputs and subscribes to its snapshot.
 */

import { useLayoutEffect } from "react";
import {
  DeferredAgentMachine,
  type DeferredAgentInputs,
} from "@workspace/agentic-core/chat-store";
import type { ChatInputContextValue, DeferredAgentState } from "../types";
import { useRetainedStore, useStoreSnapshot } from "./useChatStore";

export type UseDeferredAgentParams = DeferredAgentInputs;

/** Every input key, so an omitted optional prop clears the previous value
 *  (the machine merges patches key by key). */
function inputsFrom(params: UseDeferredAgentParams): DeferredAgentInputs {
  return {
    participants: params.participants,
    pendingAgents: params.pendingAgents,
    input: params.input,
    clearComposer: params.clearComposer,
    publishText: params.publishText,
    maybeSetDefaultTitle: params.maybeSetDefaultTitle,
    coreSendMessage: params.coreSendMessage,
    onAddAgent: params.onAddAgent,
    onPrepareAgent: params.onPrepareAgent,
    availableAgents: params.availableAgents,
    modelCatalog: params.modelCatalog,
    defaultModelRef: params.defaultModelRef,
    defaultAgentConfig: params.defaultAgentConfig,
    firstAgentModelPreflight: params.firstAgentModelPreflight,
    firstAgentPending: params.firstAgentPending,
    openingRequest: params.openingRequest,
    resolveOpeningRequest: params.resolveOpeningRequest,
    channelName: params.channelName,
    replaySettled: params.replaySettled,
  };
}

export function useDeferredAgent(params: UseDeferredAgentParams): {
  deferredAgent: DeferredAgentState | undefined;
  sendMessage: ChatInputContextValue["onSendMessage"];
} {
  // One machine per mounted surface; its last release retires a prepared
  // provisional lease (StrictMode's remount re-retains the same instance).
  const machine = useRetainedStore(() => new DeferredAgentMachine(inputsFrom(params)), []);
  // Inputs are committed render state, so they are applied after commit. A
  // layout effect reconciles before paint: a snapshot change re-renders
  // synchronously, so the setup card / queue never paints a stale frame.
  useLayoutEffect(() => {
    machine.setHostInputs(inputsFrom(params));
    machine.reconcile();
  });
  const { deferredAgent } = useStoreSnapshot(machine);
  return { deferredAgent, sendMessage: machine.send };
}
