import { buildUnitCatalogEntrySchema } from "@vibestudio/service-schemas/build";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";
import {
  modelProviderLabel,
  resolveProviderModelBaseUrl,
} from "@workspace/model-catalog/providerConnect";
/**
 * Model settings service — the single authority on what a model IS
 * (journaled `modelSpec`) and whether it is USABLE right now (`availability`).
 *
 * Catalog = pi-ai registry entries (static, cached) + local-models extension
 * entries (live, per snapshot). Availability is computed here and shared by
 * every consumer — picker, agent config, fallback logic, CLI — replacing the
 * old panel-side connection heuristic (design
 * docs/local-models-extension-design.md §6.1/§7.1/§8).
 */

import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import type { WorkspaceConfig } from "@workspace/runtime/worker";
import {
  DEFAULT_AGENT_MODEL_REF,
  LOCAL_DEFAULT_MODEL_REF,
  LOCAL_FALLBACK_MODEL_REF,
  LOCAL_MODELS_EXTENSION_ID,
  LOCAL_PROVIDER_ID,
  WORKSPACE_DEFAULT_AGENT_CONFIG_FIELD,
  isModelUsable,
  piModelToSpec,
  type AgentThinkingLevel,
  type DefaultAgentConfig,
  type ModelAvailability,
  type ModelCatalog,
  type ModelCatalogEntry,
  type ModelCatalogProvider,
  type ModelSettingsSnapshot,
  type PiModelInput,
} from "@workspace/model-catalog/catalog";
import {
  isTemplatedBaseUrl,
  modelIsConnectable,
  providerIsConnectable,
} from "@workspace/model-catalog/providerConnect";
import { pickRecommendedModelId } from "@workspace/model-catalog/modelRecommendations";
import {
  localModelEntrySchema,
  type LocalModelEntry,
} from "@workspace/model-catalog/localModels";
import {
  getBuiltinModels,
  getBuiltinProviders,
  getSupportedThinkingLevels,
} from "@workspace/model-catalog/builtinCatalog";
import { findMatchingUrlAudience } from "@vibestudio/credential-client/urlAudience";
import {
  isStoredCredentialUsable,
  type StoredCredentialSummary,
} from "@vibestudio/credential-client";
import { isRpcAborted } from "@vibestudio/rpc";

const AGENT_THINKING_LEVELS = new Set<string>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

/** llama-server quirks (design §6.4); mirrors agentic-do's model-spec.ts. */
const LLAMA_SERVER_COMPAT: Record<string, unknown> = {
  supportsReasoningEffort: false,
};

let cachedCatalog: Promise<ModelCatalog> | null = null;

export function getModelCatalog(): Promise<ModelCatalog> {
  if (!cachedCatalog) {
    const catalogPromise = buildModelCatalog();
    cachedCatalog = catalogPromise;
    catalogPromise.catch(() => {
      if (cachedCatalog === catalogPromise) cachedCatalog = null;
    });
  }
  return cachedCatalog;
}

type PiModelLike = PiModelInput;

function providerLabel(providerId: string): string {
  return modelProviderLabel(providerId);
}

/** Static pi-ai registry projection. Availability here is a placeholder —
 *  the snapshot overlay (applyCloudAvailability) is authoritative. */
export async function buildModelCatalog(): Promise<ModelCatalog> {
  const providerIds = getBuiltinProviders();
  const providers: ModelCatalogProvider[] = [];
  const models: ModelCatalogEntry[] = [];
  const recommendedRefs = new Set<string>();

  for (const providerId of providerIds) {
    const provModels = getBuiltinModels(providerId);
    const recommendedId = pickRecommendedModelId(providerId, provModels);
    if (recommendedId) recommendedRefs.add(`${providerId}:${recommendedId}`);
  }

  for (const providerId of providerIds) {
    const provModels = getBuiltinModels(providerId);
    const baseUrls = Array.from(
      new Set(provModels.map((model) => model.baseUrl)),
    );
    const recommendedModelId = pickRecommendedModelId(providerId, provModels);
    providers.push({
      id: providerId,
      label: providerLabel(providerId),
      baseUrls,
      recommendedModelRef: recommendedModelId
        ? `${providerId}:${recommendedModelId}`
        : null,
      connectable:
        providerIsConnectable(providerId) &&
        baseUrls.some((url) => modelIsConnectable(providerId, url)),
    });

    for (const model of provModels) {
      const ref = `${providerId}:${model.id}`;
      const thinkingLevels = model.reasoning
        ? (getSupportedThinkingLevels(model).filter((level) =>
            AGENT_THINKING_LEVELS.has(level),
          ) as AgentThinkingLevel[])
        : [];
      const connectable = modelIsConnectable(providerId, model.baseUrl);
      models.push({
        ref,
        id: model.id,
        name: model.name,
        provider: providerId,
        baseUrl: model.baseUrl,
        reasoning: model.reasoning,
        vision: model.input.includes("image"),
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        thinkingLevels,
        templatedBaseUrl: isTemplatedBaseUrl(model.baseUrl),
        connectable,
        recommended: recommendedRefs.has(ref),
        auth: "url-bound",
        availability: {
          state: "needs-setup",
          detail: connectable ? "no-credential" : "not-installed",
        },
        modelSpec: piModelToSpec(model as unknown as PiModelLike),
        capabilities: { tools: true },
      });
    }
  }

  return { providers, models };
}

export function localEntryToCatalogEntry(
  entry: LocalModelEntry,
): ModelCatalogEntry {
  return {
    ref: `${LOCAL_PROVIDER_ID}:${entry.slug}`,
    id: entry.slug,
    name: entry.displayName,
    provider: LOCAL_PROVIDER_ID,
    baseUrl: entry.baseUrl,
    reasoning: entry.reasoningCapable,
    vision: false,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
    tokensPerSec: entry.measuredTokensPerSec ?? null,
    thinkingLevels: [],
    templatedBaseUrl: false,
    // Local models are never "connectable" — no credential flow exists for
    // them; availability comes from live server state (design §6.3/§7.1).
    connectable: false,
    recommended:
      `${LOCAL_PROVIDER_ID}:${entry.slug}` === LOCAL_DEFAULT_MODEL_REF,
    auth: "loopback",
    availability: localAvailability(entry),
    modelSpec: {
      id: entry.slug,
      name: entry.displayName,
      api: "openai-completions",
      provider: LOCAL_PROVIDER_ID,
      baseUrl: entry.baseUrl,
      reasoning: entry.reasoningCapable,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
      compat: { ...LLAMA_SERVER_COMPAT },
    },
    capabilities: { tools: entry.toolsCapable },
  };
}

function localAvailability(entry: LocalModelEntry): ModelAvailability {
  switch (entry.state) {
    case "ready":
      return { state: "ready", detail: "running" };
    case "startable":
      return { state: "startable", detail: "will-load-on-use" };
    case "not-installed":
      return { state: "needs-setup", detail: "not-installed" };
    case "starting":
      return { state: "starting" };
    case "downloading":
      return {
        state: "downloading",
        progress: entry.download?.progress ?? 0,
        phase: entry.download?.phase ?? "queued",
        receivedBytes: entry.download?.receivedBytes ?? 0,
        totalBytes: entry.download?.totalBytes ?? null,
      };
    case "error":
      return {
        state: "error",
        message: entry.errorMessage ?? "local server error",
      };
  }
}

export function applyCloudAvailability(
  entry: ModelCatalogEntry,
  credentials: readonly StoredCredentialSummary[],
  executionMode: "provider-credentials" | "deterministic-test",
): ModelCatalogEntry {
  if (entry.auth !== "url-bound") return entry;
  if (executionMode === "deterministic-test") {
    return {
      ...entry,
      availability: { state: "ready", detail: "deterministic-test" },
    };
  }
  const configured = credentials.find(
    (credential) =>
      credential.metadata?.["modelProviderId"] === entry.provider &&
      (credential.metadata?.["modelBaseUrl"] ||
        credential.metadata?.["modelProviderConfig"]),
  );
  if (configured) {
    try {
      const baseUrl = resolveProviderModelBaseUrl(
        entry.provider,
        entry.baseUrl,
        configured.metadata,
      );
      const configuration = configured.metadata?.["modelProviderConfig"];
      entry = {
        ...entry,
        baseUrl,
        templatedBaseUrl: isTemplatedBaseUrl(baseUrl),
        connection: {
          method: configured.metadata?.["modelAuthMethod"],
          ...(configuration
            ? { configuration: JSON.parse(configuration) }
            : {}),
        },
        ...(entry.modelSpec
          ? { modelSpec: { ...entry.modelSpec, baseUrl } }
          : {}),
      };
    } catch {
      return {
        ...entry,
        availability: {
          state: "error",
          message:
            "Provider settings are invalid. Reconnect this provider to update them.",
        },
      };
    }
  }
  // The credential owner projects expiry and refresh capability into each
  // secret-free summary. A stored credential is not enough: it must be active
  // or carry persisted material that can renew it.
  const matching = credentials.filter((credential) => {
    try {
      return (
        findMatchingUrlAudience(entry.baseUrl, credential.audience) !== null
      );
    } catch {
      return false;
    }
  });
  const availableAccounts = matching.filter(isStoredCredentialUsable);
  if (
    availableAccounts.length &&
    availableAccounts.every((credential) => {
      const allowed = credential.metadata?.["modelAvailableIds"];
      if (!allowed) return false;
      try {
        return !JSON.parse(allowed).includes(entry.id);
      } catch {
        return false;
      }
    })
  )
    return {
      ...entry,
      availability: {
        state: "error",
        message:
          "This model is not available with your connected provider account. Choose another model or update your plan.",
      },
    };
  const matchedUsable = matching.some(isStoredCredentialUsable);
  const matchedExpired = matching.some(
    (credential) =>
      credential.lifecycle.state === "expired" &&
      !credential.lifecycle.canRefresh,
  );
  const availability: ModelAvailability = matchedUsable
    ? { state: "ready", detail: "credentialed" }
    : {
        state: "needs-setup",
        detail: matchedExpired
          ? "credential-expired"
          : entry.connectable
            ? "no-credential"
            : "not-installed",
      };
  return { ...entry, availability };
}

export function pickFallbackModel(catalog: ModelCatalog): {
  ref: string;
  reason?: "missing" | "unavailable";
} {
  const byRef = (ref: string) =>
    catalog.models.find((model) => model.ref === ref);
  const preferred = byRef(DEFAULT_AGENT_MODEL_REF);
  const preferredRef = preferred?.ref;
  if (preferred?.capabilities.tools && isModelUsable(preferred))
    return { ref: preferred.ref };
  const recommended = catalog.models.find(
    (model) =>
      model.recommended && model.capabilities.tools && isModelUsable(model),
  );
  if (recommended) return { ref: recommended.ref };
  // Prefer the local floor once the user has explicitly installed it.
  const localFloor = byRef(LOCAL_FALLBACK_MODEL_REF);
  if (localFloor?.capabilities.tools && isModelUsable(localFloor))
    return { ref: localFloor.ref };
  const anyUsable = catalog.models.find(
    (model) => model.capabilities.tools && isModelUsable(model),
  );
  if (anyUsable) return { ref: anyUsable.ref };
  // Nothing usable at all — keep the old static preference so the connect
  // flow has a sensible target.
  return { ref: preferredRef ?? catalog.models[0]?.ref ?? "" };
}

export class ModelSettingsDO extends DurableObjectBase {
  private readonly observers = new Set<{
    afterVersion: string;
    resolve(value: string): void;
    reject(error: unknown): void;
  }>();
  private observationClosed = false;

  private defaultVersion(): string {
    return JSON.stringify(
      this.getStateValue(WORKSPACE_DEFAULT_AGENT_CONFIG_FIELD) ?? null,
    );
  }

  private publishDefaultChange(): void {
    const version = this.defaultVersion();
    for (const observer of this.observers) {
      if (version !== observer.afterVersion) observer.resolve(version);
    }
  }

  @rpc({
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
    website: {
      kind: "closed",
      reason:
        "Workspace model setup observation belongs to authenticated workspace clients.",
    },
  })
  async observeChanges(
    input: { afterVersion?: string } = {},
  ): Promise<{ version: string }> {
    if (this.observationClosed)
      throw new Error("Model settings owner is retiring");
    const signal = this.rpcAbortSignal;
    signal?.throwIfAborted();
    const previous =
      input.afterVersion === undefined
        ? null
        : this.parseObservationVersion(input.afterVersion);
    const currentDefault = this.defaultVersion();
    if (previous && currentDefault !== previous[0]) {
      return {
        version: this.encodeObservationVersion(currentDefault, previous[1]),
      };
    }

    const childController = new AbortController();
    const parentAborted = () => childController.abort(signal?.reason);
    signal?.addEventListener("abort", parentAborted, { once: true });
    if (signal?.aborted) parentAborted();

    let resolveDefault!: (version: string) => void;
    let rejectDefault!: (error: unknown) => void;
    const defaultChanged = new Promise<string>((resolve, reject) => {
      resolveDefault = resolve;
      rejectDefault = reject;
    });
    const observer = {
      afterVersion: currentDefault,
      resolve: resolveDefault,
      reject: (error: unknown) => {
        childController.abort(error);
        rejectDefault(error);
      },
    };
    const aborted = () => observer.reject(signal?.reason);
    this.observers.add(observer);
    signal?.addEventListener("abort", aborted, { once: true });

    const credentialObservation = this.rpc.call<{ version: string }>(
      "main",
      "credentials.observeChanges",
      [previous ? { afterVersion: previous[1] } : {}],
      { signal: childController.signal },
    );
    const credentialChanged = credentialObservation.then((result) => {
      if (!result || typeof result.version !== "string")
        throw new Error("Credential observation returned an invalid revision");
      return result.version;
    });
    const defaultEvent = defaultChanged.then((version) => ({
      kind: "default" as const,
      version,
    }));
    const credentialEvent = credentialChanged.then((version) => ({
      kind: "credential" as const,
      version,
    }));

    try {
      const event = await Promise.race([defaultEvent, credentialEvent]);
      if (event.kind === "credential") {
        return {
          version: this.encodeObservationVersion(
            this.defaultVersion(),
            event.version,
          ),
        };
      }

      // The first call has no credential revision to carry forward. A default
      // change while that read is pending updates the other half of the
      // snapshot, but cannot cancel or replace the required credential read.
      if (!previous) {
        const credentialVersion = await credentialChanged;
        return {
          version: this.encodeObservationVersion(
            this.defaultVersion(),
            credentialVersion,
          ),
        };
      }

      const completed = new Error(
        "Model settings changed while awaiting credentials",
      );
      childController.abort(completed);
      try {
        const credentialVersion = await credentialChanged;
        return {
          version: this.encodeObservationVersion(
            event.version,
            credentialVersion,
          ),
        };
      } catch (error) {
        if (!isRpcAborted(error)) throw error;
        return {
          version: this.encodeObservationVersion(event.version, previous[1]),
        };
      }
    } catch (error) {
      childController.abort(error);
      try {
        await credentialChanged;
      } catch (cleanupError) {
        if (!isRpcAborted(cleanupError) && cleanupError !== error) {
          throw new AggregateError(
            [error, cleanupError],
            "Model settings observation failed and credential observation cleanup failed.",
            { cause: error },
          );
        }
      }
      throw error;
    } finally {
      childController.abort(new Error("Model settings observation completed"));
      observer.reject(
        new Error("Model settings default observation completed"),
      );
      await Promise.allSettled([defaultChanged, credentialChanged]);
      this.observers.delete(observer);
      signal?.removeEventListener("abort", aborted);
      signal?.removeEventListener("abort", parentAborted);
    }
  }

  private parseObservationVersion(version: string): readonly [string, string] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(version);
    } catch {
      throw new Error("Model settings observation version is invalid");
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      throw new Error("Model settings observation version is invalid");
    }
    return [parsed[0], parsed[1]];
  }

  private encodeObservationVersion(
    defaultVersion: string,
    credentialVersion: string,
  ): string {
    return JSON.stringify([defaultVersion, credentialVersion]);
  }

  override async releaseForLifecycle(
    input: Parameters<DurableObjectBase["releaseForLifecycle"]>[0],
  ) {
    this.observationClosed = true;
    for (const observer of this.observers)
      observer.reject(new Error("Model settings owner retired"));
    return super.releaseForLifecycle(input);
  }

  override async resumeAfterRestart(
    input: Parameters<DurableObjectBase["resumeAfterRestart"]>[0],
  ) {
    await super.resumeAfterRestart(input);
    this.observationClosed = false;
  }

  protected createTables(): void {}

  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "The model catalog is secret-free metadata needed by portable connected chat clients; credential use remains separately gated.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async listCatalog(): Promise<ModelCatalog> {
    return this.assembleCatalog();
  }

  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "The resolved model settings expose model choice and secret-free availability; they do not disclose credential material or grant model use.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getSettings(): Promise<ModelSettingsSnapshot> {
    const configRequest = this.getWorkspaceConfig();
    const [catalog, config] = await Promise.all([
      this.assembleCatalog(configRequest),
      configRequest,
    ]);
    return this.resolveSettings(catalog, config);
  }

  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "The default model projection is secret-free metadata used to initialize portable connected chat clients; selecting or using a credential remains separately gated.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getDefaultModel(): Promise<ModelSettingsSnapshot> {
    return this.getSettings();
  }

  @rpc({
    website: {
      kind: "eligible",
      rationale:
        "Availability inspection returns only requested model metadata and never transports credential material; model use remains separately authorized.",
    },
    principals: ["host", "user", "code", "session", "mission", "website"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async inspectModels(refs: string[]): Promise<{
    defaultModel: string;
    models: Array<{ ref: string; availability: ModelAvailability }>;
  }> {
    const uniqueRefs = [...new Set(refs)];
    const settings = await this.getSettings();
    return {
      defaultModel: settings.defaultModel,
      models: uniqueRefs.map((ref) => {
        const model = settings.catalog.models.find(
          (entry) => entry.ref === ref,
        );
        return {
          ref,
          availability: model?.availability ?? {
            state: "error",
            message: "Unknown model ref",
          },
        };
      }),
    };
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver owns workspace orchestration or retained workspace data; websites require a reviewed bounded operation.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async setDefaultAgentConfig(
    input: DefaultAgentConfig,
  ): Promise<ModelSettingsSnapshot> {
    const requested = parseDefaultAgentConfig(input, true);
    const workspaceConfig = this.getWorkspaceConfig();
    const catalog = await this.assembleCatalog(workspaceConfig);
    const model = catalog.models.find((entry) => entry.ref === requested.model);
    if (!model) {
      throw new Error(`Unknown model ref: ${requested.model}`);
    }
    const config: DefaultAgentConfig = {
      model: model.ref,
      ...(requested.thinkingLevel
        ? { thinkingLevel: requested.thinkingLevel }
        : {}),
      fastMode: requested.fastMode ?? false,
      ...(requested.approvalLevel !== undefined
        ? { approvalLevel: requested.approvalLevel }
        : {}),
    };
    this.setStateValue(
      WORKSPACE_DEFAULT_AGENT_CONFIG_FIELD,
      JSON.stringify(config),
    );
    this.publishDefaultChange();
    return this.resolveSettings(catalog, await workspaceConfig);
  }

  @rpc({
    website: {
      kind: "closed",
      reason:
        "Workspace defaults are initialized by the installed agent runtime.",
    },
    principals: ["host", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async initializeDefaultAgentModel(model: string): Promise<void> {
    const config = await this.getWorkspaceConfig();
    if (this.getSavedDefaultAgentConfig(config)) return;
    await this.setDefaultAgentConfig({ model });
  }

  /** Static pi projection — overridable seam for tests. */
  protected getCatalog(): Promise<ModelCatalog> {
    return getModelCatalog();
  }

  /** Static pi catalog + live availability overlay + live local entries. */
  protected async assembleCatalog(
    config = this.getWorkspaceConfig(),
  ): Promise<ModelCatalog> {
    const [base, credentials, localEntries] = await Promise.all([
      this.getCatalog(),
      this.storedCredentials(),
      config.then((workspaceConfig) => this.fetchLocalModels(workspaceConfig)),
    ]);
    const executionMode =
      this.env["VIBESTUDIO_TEST_MODE"] === "1"
        ? ("deterministic-test" as const)
        : ("provider-credentials" as const);
    const models = [
      ...base.models.map((entry) =>
        applyCloudAvailability(entry, credentials, executionMode),
      ),
      ...localEntries.map(localEntryToCatalogEntry),
    ];
    const recommendedLocalModelRef = localEntries.some(
      (entry) =>
        `${LOCAL_PROVIDER_ID}:${entry.slug}` === LOCAL_DEFAULT_MODEL_REF,
    )
      ? LOCAL_DEFAULT_MODEL_REF
      : localEntries.some(
            (entry) =>
              `${LOCAL_PROVIDER_ID}:${entry.slug}` === LOCAL_FALLBACK_MODEL_REF,
          )
        ? LOCAL_FALLBACK_MODEL_REF
        : null;
    const providers: ModelCatalogProvider[] = localEntries.length
      ? [
          ...base.providers,
          {
            id: LOCAL_PROVIDER_ID,
            label: "Local inference (experimental)",
            baseUrls: Array.from(
              new Set(localEntries.map((entry) => entry.baseUrl)),
            ),
            recommendedModelRef: recommendedLocalModelRef,
            connectable: false,
          },
        ]
      : [...base.providers];
    return { providers, models };
  }

  /** Successful empty inventories are authoritative; failed discovery is not absence. */
  protected async storedCredentials(): Promise<StoredCredentialSummary[]> {
    const credentials = await this.rpc.call<unknown>(
      "main",
      "credentials.listStoredCredentials",
      [],
    );
    return credentialsMethods.listStoredCredentials.returns.parse(credentials);
  }

  /** Use the effective layered main declaration and its matching main build graph. */
  protected async fetchLocalModels(
    config: WorkspaceConfig,
  ): Promise<LocalModelEntry[]> {
    const declarations = config.extensions ?? [];
    if (declarations.length === 0) return [];
    const units = buildUnitCatalogEntrySchema
      .array()
      .parse(await this.rpc.call<unknown>("main", "build.listUnits", []));
    const local = units.find(
      (unit) =>
        unit.kind === "extension" && unit.name === LOCAL_MODELS_EXTENSION_ID,
    );
    const declaration = declarations.find(
      (declared) =>
        declared.source === LOCAL_MODELS_EXTENSION_ID ||
        declared.source === "extensions/local-models" ||
        declared.source === local?.source,
    );
    if (!declaration) return [];
    if (!local)
      throw new Error(
        `Declared local model provider ${declaration.source} has no valid extension build unit ${LOCAL_MODELS_EXTENSION_ID}; repair its package manifest/source declaration.`,
      );
    const entries = await this.rpc.call<unknown>("main", "extensions.invoke", [
      LOCAL_MODELS_EXTENSION_ID,
      "listModels",
      [],
    ]);
    return localModelEntrySchema.array().parse(entries);
  }

  protected getWorkspaceConfig(): Promise<WorkspaceConfig> {
    return this.rpc.call<WorkspaceConfig>("main", "workspace.getConfig", []);
  }

  /** Saved preferences belong to this service, not protected workspace source.
   * Authored template defaults seed a workspace until the user saves a preference. */
  private getSavedDefaultAgentConfig(config: WorkspaceConfig): unknown {
    const saved = this.getStateValue(WORKSPACE_DEFAULT_AGENT_CONFIG_FIELD);
    return saved === null ? config.defaultAgentConfig : JSON.parse(saved);
  }

  private resolveSettings(
    catalog: ModelCatalog,
    config: WorkspaceConfig,
  ): ModelSettingsSnapshot {
    const stored = parseDefaultAgentConfig(
      this.getSavedDefaultAgentConfig(config),
    );
    const behavior = {
      ...(stored.thinkingLevel ? { thinkingLevel: stored.thinkingLevel } : {}),
      fastMode: stored.fastMode ?? false,
      ...(stored.approvalLevel !== undefined
        ? { approvalLevel: stored.approvalLevel }
        : {}),
    };
    const storedEntry = stored.model
      ? catalog.models.find((model) => model.ref === stored.model)
      : undefined;
    const fallback = pickFallbackModel(catalog);
    const fallbackEntry = catalog.models.find(
      (model) => model.ref === fallback.ref,
    );
    // Preserve the stored preference. Temporarily use another agent-capable
    // model when the preference is unavailable; reconnecting restores it.
    // With nothing usable, keep the preference as the setup target.
    if (
      storedEntry &&
      (isModelUsable(storedEntry) || !isModelUsable(fallbackEntry))
    ) {
      return {
        catalog,
        defaultModel: storedEntry.ref,
        defaultModelSource: "workspace",
        defaultAgentConfig: { model: storedEntry.ref, ...behavior },
      };
    }
    const fallbackBehavior = {
      ...behavior,
      fastMode:
        behavior.fastMode &&
        !!fallbackEntry?.modelSpec.serviceTiers?.includes("priority"),
    };
    if (
      fallbackBehavior.thinkingLevel &&
      !fallbackEntry?.thinkingLevels.includes(fallbackBehavior.thinkingLevel)
    ) {
      delete fallbackBehavior.thinkingLevel;
    }
    return {
      catalog,
      defaultModel: fallback.ref,
      defaultModelSource: "fallback",
      ...(stored.model
        ? {
            defaultModelFallbackReason: storedEntry ? "unavailable" : "missing",
            invalidDefaultModel: stored.model,
          }
        : {}),
      defaultAgentConfig: { model: fallback.ref, ...fallbackBehavior },
    };
  }
}

/** Parse the one current default-agent configuration shape. */
function parseDefaultAgentConfig(
  value: unknown,
  required = false,
): {
  model: string | null;
  thinkingLevel?: AgentThinkingLevel;
  fastMode?: boolean;
  approvalLevel?: 0 | 1 | 2;
} {
  if (value === undefined || value === null) {
    if (required) throw new Error("defaultAgentConfig is required");
    return { model: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("defaultAgentConfig must be an object");
  }
  const v = value as Record<string, unknown>;
  const unknownKeys = Object.keys(v).filter(
    (key) =>
      key !== "model" &&
      key !== "thinkingLevel" &&
      key !== "fastMode" &&
      key !== "approvalLevel",
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `defaultAgentConfig has unknown field(s): ${unknownKeys.join(", ")}`,
    );
  }
  const rawModel = v["model"];
  if (typeof rawModel !== "string" || rawModel.trim().length === 0) {
    throw new Error("defaultAgentConfig.model must be a non-empty string");
  }
  const model = rawModel.trim();
  const rawThinking = v["thinkingLevel"];
  if (
    rawThinking !== undefined &&
    !AGENT_THINKING_LEVELS.has(rawThinking as string)
  ) {
    throw new Error(
      `Invalid defaultAgentConfig.thinkingLevel: ${String(rawThinking)}`,
    );
  }
  const thinkingLevel = rawThinking as AgentThinkingLevel | undefined;
  const rawFastMode = v["fastMode"];
  if (rawFastMode !== undefined && typeof rawFastMode !== "boolean") {
    throw new Error(
      `Invalid defaultAgentConfig.fastMode: ${String(rawFastMode)}`,
    );
  }
  const rawApproval = v["approvalLevel"];
  if (
    rawApproval !== undefined &&
    rawApproval !== 0 &&
    rawApproval !== 1 &&
    rawApproval !== 2
  ) {
    throw new Error(
      `Invalid defaultAgentConfig.approvalLevel: ${String(rawApproval)}`,
    );
  }
  const approvalLevel = rawApproval as 0 | 1 | 2 | undefined;
  return {
    model,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(rawFastMode !== undefined ? { fastMode: rawFastMode } : {}),
    ...(approvalLevel !== undefined ? { approvalLevel } : {}),
  };
}

export default {
  async fetch() {
    return new Response(
      "Model Settings service.\nMethods: listCatalog, getSettings, getDefaultModel, inspectModels, setDefaultAgentConfig, initializeDefaultAgentModel.\n",
      { headers: { "Content-Type": "text/plain" } },
    );
  },
};
