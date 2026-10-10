import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type {
  DefaultAgentConfig,
  ModelCatalog,
  ModelAvailability,
  ModelSettingsSnapshot,
} from "./catalog.js";

/** Public RPC contract for the workspace model-settings service. */
export interface ModelSettingsRpc {
  observeChanges(input?: { afterVersion?: string }): Promise<{ version: string }>;
  listCatalog(): Promise<ModelCatalog>;
  getSettings(): Promise<ModelSettingsSnapshot>;
  getDefaultModel(): Promise<ModelSettingsSnapshot>;
  inspectModels(refs: string[]): Promise<{
    defaultModel: string;
    models: Array<{ ref: string; availability: ModelAvailability }>;
  }>;
  setDefaultAgentConfig(input: DefaultAgentConfig): Promise<ModelSettingsSnapshot>;
  initializeDefaultAgentModel(model: string): Promise<void>;
}

export const modelSettingsRpcMethods = createReceiverRpcMethods<ModelSettingsRpc>([
  "observeChanges",
  "listCatalog",
  "getSettings",
  "getDefaultModel",
  "inspectModels",
  "setDefaultAgentConfig",
  "initializeDefaultAgentModel",
]);
