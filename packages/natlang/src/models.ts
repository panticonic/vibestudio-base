import { createDurableObjectServiceClient } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import type { RpcCallerLike } from "@vibestudio/shared/workspaceServiceRpc";
import {
  LOCAL_PROVIDER_ID,
  MODEL_SETTINGS_SERVICE_PROTOCOL,
  isModelUsable,
  type ModelCatalogEntry,
} from "@workspace/model-catalog/catalog";
import { isModelRole } from "@workspace/model-catalog/modelRoles";
import { modelSettingsRpcMethods } from "@workspace/model-catalog/rpc-contract";
import type { ModelConfig, ModelDriver } from "../vendor/workerd/natlang-workerd.js";
import type { ExecutorIdentity } from "./executorIdentity.js";
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
}): {
  executor: ModelConfig;
  /** What the runtime records as the executor: the model the role resolved to and how it is served. */
  executorIdentity: ExecutorIdentity;
  /** Name the model the executor role resolved to, for the records of the calls that follow. */
  pinExecutor(entry: ModelCatalogEntry | null): void;
  models: Record<string, ModelConfig>;
} {
  /**
   * Natlang's guided generation is a feature of its llama.cpp fork, which serves every local model. Natlang asks
   * for it when the model config wants it (`guidance`) and the driver can do it (`driver.guidance`); both follow
   * the one predicate, so a model is guided exactly when it is served locally.
   */
  const driverFor = (model: string, guided: () => boolean): ModelDriver => {
    const driver = gatewayDriver({
      gateway: options.gateway,
      resolver: options.directory,
      model,
      turnPrefix: `${options.turnPrefix}:${model}`,
    });
    Object.defineProperty(driver, "guidance", { get: () => (guided() ? true : undefined), enumerable: true });
    return driver;
  };
  let pinned: ModelCatalogEntry | null = null;
  const executorGuided = () => pinned?.provider === LOCAL_PROVIDER_ID;
  const executor: ModelConfig = {
    driver: driverFor(EXECUTOR_ROLE, executorGuided),
    get id() {
      return pinned?.ref ?? EXECUTOR_ROLE;
    },
    get guidance() {
      return executorGuided() ? true : undefined;
    },
  };
  /**
   * The identity a call's record and an adaptation artifact bind to, in natlang's shape: what ran and how it is
   * served. `request` is the model's own serving settings from the catalog (for a natlang stock model the very
   * request natlang's server serves it with, so a suite measured there describes what the gateway runs).
   */
  const executorIdentity: ExecutorIdentity = {
    get id() {
      return `gateway:${pinned?.ref ?? EXECUTOR_ROLE}`;
    },
    get configuration() {
      return {
        model: pinned?.ref ?? EXECUTOR_ROLE,
        request: pinned?.modelSpec.samplingParams ?? {},
        ...(executorGuided() ? { guidance: true } : {}),
      };
    },
  };
  const named = new Map<string, ModelConfig>([[EXECUTOR_ROLE, executor]]);
  const models = new Proxy({} as Record<string, ModelConfig>, {
    get(_, name) {
      if (typeof name !== "string") return undefined;
      let config = named.get(name);
      if (!config) {
        const guided = name.startsWith(`${LOCAL_PROVIDER_ID}:`);
        config = { driver: driverFor(name, () => guided), id: name, ...(guided ? { guidance: true } : {}) };
        named.set(name, config);
      }
      return config;
    },
    has: (_, name) => typeof name === "string",
  });
  return { executor, executorIdentity, pinExecutor: (entry) => void (pinned = entry), models };
}
