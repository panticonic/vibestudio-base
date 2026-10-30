import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type {
  DefaultAgentConfig,
  ModelCatalog,
  ModelAvailability,
  ModelCatalogEntry,
  ModelSettingsSnapshot,
} from "./catalog.js";
import type { ModelRoleResolution } from "./modelRoles.js";

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
  /** One catalog entry by "provider:id", or null when the catalog has no such model. */
  getModel(ref: string): Promise<ModelCatalogEntry | null>;
  /** What fills a role right now, from current local readiness and connected providers. */
  resolveRole(role: string): Promise<ModelRoleResolution>;
  setDefaultAgentConfig(input: DefaultAgentConfig): Promise<ModelSettingsSnapshot>;
  initializeDefaultAgentModel(model: string): Promise<void>;
}

export const modelSettingsRpcMethods = createReceiverRpcMethods<ModelSettingsRpc>([
  "observeChanges",
  "listCatalog",
  "getSettings",
  "getDefaultModel",
  "inspectModels",
  "getModel",
  "resolveRole",
  "setDefaultAgentConfig",
  "initializeDefaultAgentModel",
]);
