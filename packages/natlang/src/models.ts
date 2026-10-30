import { createDurableObjectServiceClient } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import type { RpcCallerLike } from "@vibestudio/shared/workspaceServiceRpc";
import {
  MODEL_SETTINGS_SERVICE_PROTOCOL,
  isModelUsable,
  type ModelCatalogEntry,
} from "@workspace/model-catalog/catalog";
import { isModelRole } from "@workspace/model-catalog/modelRoles";
import { modelSettingsRpcMethods } from "@workspace/model-catalog/rpc-contract";
import type { ModelConfig, ModelDriver } from "../vendor/core/natlang-core.js";
import { gatewayDriver, type ModelResolver } from "./driver.js";
import type { ModelGatewayClient } from "@workspace/model-gateway/client";

/** The role the default natlang model resolves through. */
export const EXECUTOR_ROLE = "executor";

/**
 * Resolves natlang's model names through the model settings service (the single
 * authority on what a model is and whether it is usable). A role resolves from
 * the live catalog; the choice is made once per epoch, so every call of one eval
 * cell runs on the same model and the record names it.
 */
export class ModelDirectory implements ModelResolver {
  private readonly settings;
  private epoch = new Map<string, Promise<ModelCatalogEntry>>();

  constructor(rpc: RpcCallerLike) {
    this.settings = createDurableObjectServiceClient(
      rpc,
      MODEL_SETTINGS_SERVICE_PROTOCOL,
      modelSettingsRpcMethods
    );
  }

  /** Forget role resolutions: the next call resolves from current readiness. */
  newEpoch(): void {
    this.epoch = new Map();
  }

  resolve(model: string): Promise<ModelCatalogEntry> {
    let resolution = this.epoch.get(model);
    if (!resolution) {
      resolution = this.lookup(model);
      this.epoch.set(model, resolution);
      // A failure is the answer for this epoch's callers, not a cached verdict.
      resolution.catch(() => {
        if (this.epoch.get(model) === resolution) this.epoch.delete(model);
      });
    }
    return resolution;
  }

  private async lookup(model: string): Promise<ModelCatalogEntry> {
    if (isModelRole(model)) {
      const resolution = await this.settings.call("resolveRole", model);
      if (!resolution.model) throw new Error(resolution.reason);
      return resolution.model;
    }
    const entry = await this.settings.call("getModel", model);
    if (!entry) {
      throw new Error(
        `Unknown model ${JSON.stringify(model)}: a natlang model name is a model role (${EXECUTOR_ROLE}) or a "provider:id" model ref`
      );
    }
    if (!isModelUsable(entry)) {
      throw new Error(
        `Model ${entry.ref} is not available (${entry.availability.state}); connect its provider first`
      );
    }
    return entry;
  }
}

/**
 * The runtime's models: the default is the executor role, and a function whose
 * frontmatter says `model: NAME` runs on the model NAME names (a role or a
 * "provider:id" ref). `models` answers any NAME with a driver; a NAME that names
 * no usable model fails the call that asked for it, naming the model.
 */
export function modelsFor(options: {
  gateway: ModelGatewayClient;
  directory: ModelDirectory;
  turnPrefix: string;
}): { executor: ModelConfig; models: Record<string, ModelConfig> } {
  const driverFor = (model: string): ModelDriver =>
    gatewayDriver({
      gateway: options.gateway,
      resolver: options.directory,
      model,
      turnPrefix: `${options.turnPrefix}:${model}`,
    });
  const executor: ModelConfig = { driver: driverFor(EXECUTOR_ROLE), id: EXECUTOR_ROLE };
  const named = new Map<string, ModelConfig>([[EXECUTOR_ROLE, executor]]);
  const models = new Proxy({} as Record<string, ModelConfig>, {
    get(_, name) {
      if (typeof name !== "string") return undefined;
      let config = named.get(name);
      if (!config) {
        config = { driver: driverFor(name), id: name };
        named.set(name, config);
      }
      return config;
    },
    has: (_, name) => typeof name === "string",
  });
  return { executor, models };
}
