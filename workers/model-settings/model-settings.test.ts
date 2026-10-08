import { describe, expect, it } from "vitest";
import {
  createTestDO,
  createTestDirectAuthority,
} from "@workspace/runtime/worker/test-utils";
import type { DirectAuthorityAttestation } from "@vibestudio/rpc/internal";
import type { WorkspaceConfig } from "@workspace/runtime/worker";
import {
  DEFAULT_AGENT_MODEL_REF,
  LOCAL_DEFAULT_MODEL_REF,
  LOCAL_FALLBACK_MODEL_REF,
  type DefaultAgentConfig,
  type ModelCatalog,
} from "@workspace/model-catalog/catalog";
import type { LocalModelEntry } from "@workspace/model-catalog/localModels";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import type { StoredCredentialSummary } from "@vibestudio/credential-client";
import {
  applyCloudAvailability,
  getModelCatalog,
  localEntryToCatalogEntry,
  pickFallbackModel,
  ModelSettingsDO,
} from "./index.js";
import { WORKSPACE_SYSTEM_EPOCH } from "@vibestudio/shared/vcs/systemEpoch";

const BASE_CONFIG = {
  id: "test",
  systemEpoch: WORKSPACE_SYSTEM_EPOCH,
} as const;

function localEntry(fields: Partial<LocalModelEntry> = {}): LocalModelEntry {
  return {
    slug: "lfm2.5-2.6b",
    displayName: "LFM2.5 2.6B",
    baseUrl: "http://127.0.0.1:0/v1",
    server: "utility",
    contextWindow: 32_768,
    maxTokens: 32_768,
    measuredTokensPerSec: null,
    toolsCapable: true,
    reasoningCapable: false,
    fit: {
      fit: "cpu-only",
      estTokensPerSec: null,
      contextLength: 32_768,
      gpuLayers: 0,
      notes: [],
    },
    state: "not-installed",
    download: null,
    errorMessage: null,
    ...fields,
  };
}

function storedCredential(
  id: string,
  url: string,
  lifecycle: StoredCredentialSummary["lifecycle"] = {
    state: "active",
    canRefresh: false,
  },
): StoredCredentialSummary {
  return {
    id,
    label: id,
    audience: [{ url, match: "origin" }],
    injection: {
      type: "header",
      name: "authorization",
      valueTemplate: "Bearer {token}",
    },
    scopes: [],
    lifecycle,
  };
}

const CATALOG: ModelCatalog = {
  providers: [
    {
      id: "openai",
      label: "openai",
      baseUrls: ["https://api.openai.com/v1"],
      recommendedModelRef: "openai:gpt-5",
      connectable: true,
    },
    {
      id: "anthropic",
      label: "anthropic",
      baseUrls: ["https://api.anthropic.com/v1"],
      recommendedModelRef: "anthropic:claude-opus-4-1",
      connectable: true,
    },
  ],
  models: [
    makeTestCatalogEntry({
      ref: "openai:gpt-5",
      id: "gpt-5",
      name: "GPT-5",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      reasoning: true,
      vision: true,
      contextWindow: 128000,
      maxTokens: 16000,
      thinkingLevels: ["minimal", "low", "medium", "high"],
      recommended: true,
    }),
    makeTestCatalogEntry({
      ref: "anthropic:claude-opus-4-1",
      id: "claude-opus-4-1",
      name: "Claude Opus 4.1",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      reasoning: true,
      vision: true,
      contextWindow: 200000,
      maxTokens: 32000,
      thinkingLevels: ["low", "medium", "high"],
      recommended: true,
    }),
  ],
};

const CODEX_CATALOG_ENTRY = makeTestCatalogEntry({
  ref: "openai-codex:gpt-6.1-sol",
  id: "gpt-6.1-sol",
  name: "GPT-6.1 Sol",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api/codex",
  recommended: true,
});
CODEX_CATALOG_ENTRY.modelSpec.serviceTiers = ["priority"];
const CODEX_CATALOG: ModelCatalog = {
  providers: [],
  models: [CODEX_CATALOG_ENTRY],
};

class TestModelSettingsDO extends ModelSettingsDO {
  static config: WorkspaceConfig = { ...BASE_CONFIG };
  static writes: Array<{ key: string; value: unknown }> = [];

  protected getCatalog(): Promise<ModelCatalog> {
    return Promise.resolve(CATALOG);
  }

  // Both fixture providers count as usable — availability is a worker overlay
  // now (design §7.1), so the seam is lifecycle summaries, not entry fields.
  protected storedCredentials(): Promise<StoredCredentialSummary[]> {
    return Promise.resolve([
      storedCredential("openai", "https://api.openai.com/v1"),
      storedCredential("anthropic", "https://api.anthropic.com/v1"),
    ]);
  }

  // No local-models extension in the unit harness.
  protected fetchLocalModels(): Promise<LocalModelEntry[]> {
    return Promise.resolve([]);
  }

  protected getWorkspaceConfig(): Promise<WorkspaceConfig> {
    return Promise.resolve(TestModelSettingsDO.config);
  }

  protected override setStateValue(key: string, value: string): void {
    super.setStateValue(key, value);
    if (key === "defaultAgentConfig")
      TestModelSettingsDO.writes.push({ key, value: JSON.parse(value) });
  }
}

/** No credentials at all + a live local fallback — the offline first-run shape. */
class OfflineModelSettingsDO extends TestModelSettingsDO {
  protected override storedCredentials(): Promise<StoredCredentialSummary[]> {
    return Promise.resolve([]);
  }

  protected override fetchLocalModels() {
    return Promise.resolve([
      localEntry({
        baseUrl: "http://127.0.0.1:43117/v1",
        measuredTokensPerSec: 18.4,
        state: "ready" as const,
      }),
    ]);
  }
}

class ExpiredModelSettingsDO extends TestModelSettingsDO {
  static lifecycle: StoredCredentialSummary["lifecycle"] = {
    state: "expired",
    canRefresh: false,
  };

  protected override storedCredentials(): Promise<StoredCredentialSummary[]> {
    return Promise.resolve([
      storedCredential(
        "openai",
        "https://api.openai.com/v1",
        ExpiredModelSettingsDO.lifecycle,
      ),
    ]);
  }
}

class CodexModelSettingsDO extends TestModelSettingsDO {
  protected override getCatalog(): Promise<ModelCatalog> {
    return Promise.resolve(CODEX_CATALOG);
  }
}

function websiteCaller(method: string) {
  const subject = "website:site-1" as const;
  const userId = "user:test" as const;
  const binding = { subject, generation: 0, documentId: "document-1" };
  const baseAuthorization = createTestDirectAuthority({
    callerKind: "panel",
    method,
  });
  const authorization: DirectAuthorityAttestation = {
    ...baseAuthorization,
    context: {
      ...baseAuthorization.context,
      authorizingOrigin: { kind: "website", principal: subject } as const,
      executingCode: null,
      subjectBinding: binding,
      website: {
        subject,
        userId,
        workspaceId: "test",
        origin: "https://example.com",
        binding,
        connected: true,
      },
      initiatorChain: [userId, subject],
      ownerChain: [userId],
    },
    grants: [
      {
        subject,
        capability: `rpc:${method}`,
        resource: { kind: "exact", key: "do:test:TestDO:test-key" },
        effect: "allow",
        issuedBy: userId,
        createdAt: 0,
        constraints: {
          subjectGeneration: 0,
          sourceWorkspaceId: "test",
        },
        provenance: "durable-test-host-attestation",
      },
    ],
  };
  return {
    callerId: "website" as const,
    callerKind: "panel" as const,
    authorization,
  };
}

describe("ModelSettingsDO", () => {
  it("serves secret-free model projections to a website while keeping writes closed", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    const { callAs } = await createTestDO(TestModelSettingsDO);

    const catalog = await callAs<ModelCatalog>(
      websiteCaller("listCatalog"),
      "listCatalog",
    );
    const settings = await callAs(websiteCaller("getSettings"), "getSettings");
    const defaultModel = await callAs(
      websiteCaller("getDefaultModel"),
      "getDefaultModel",
    );
    const inspected = await callAs(
      websiteCaller("inspectModels"),
      "inspectModels",
      ["openai:gpt-5"],
    );

    expect(catalog.models).toHaveLength(2);
    expect(settings).toMatchObject({ catalog: { models: expect.any(Array) } });
    expect(defaultModel).toMatchObject({
      catalog: { models: expect.any(Array) },
    });
    expect(inspected).toMatchObject({ models: [{ ref: "openai:gpt-5" }] });
    expect(
      JSON.stringify({ catalog, settings, defaultModel, inspected }),
    ).not.toMatch(
      /authorization|api[-_]?key|bearer\s|client[-_]?secret|access[-_]?token|refresh[-_]?token/iu,
    );

    await expect(
      callAs(websiteCaller("setDefaultAgentConfig"), "setDefaultAgentConfig", {
        model: "openai:gpt-5",
      }),
    ).rejects.toThrow(/receiver is closed to websites/);
  });

  it("treats an absent local model as setup-required", () => {
    expect(
      localEntryToCatalogEntry(
        localEntry({
          state: "not-installed",
        }),
      ).availability,
    ).toEqual({ state: "needs-setup", detail: "not-installed" });
  });

  it("preserves local download phase and byte progress in the catalog", () => {
    expect(
      localEntryToCatalogEntry(
        localEntry({
          state: "downloading",
          download: {
            progress: 0.4,
            phase: "paused",
            receivedBytes: 280_000_000,
            totalBytes: 700_000_000,
          },
        }),
      ).availability,
    ).toEqual({
      state: "downloading",
      progress: 0.4,
      phase: "paused",
      receivedBytes: 280_000_000,
      totalBytes: 700_000_000,
    });
  });

  it("keeps local models unavailable while the runtime is being prepared", () => {
    expect(
      localEntryToCatalogEntry(
        localEntry({
          state: "starting",
        }),
      ).availability,
    ).toEqual({ state: "starting" });
  });

  it("recommends Qwen3.8 while keeping the compact model as fallback only", () => {
    expect(
      localEntryToCatalogEntry(
        localEntry({
          slug: "qwen3.8-27b",
          displayName: "Qwen3.8 27B",
          server: "main",
          reasoningCapable: true,
        }),
      ).recommended,
    ).toBe(true);
    expect(localEntryToCatalogEntry(localEntry()).recommended).toBe(false);
    expect(LOCAL_DEFAULT_MODEL_REF).toBe("local:qwen3.8-27b");
    expect(LOCAL_FALLBACK_MODEL_REF).toBe("local:lfm2.5-2.6b");
  });

  it("projects local reasoning capability into the pi model spec", () => {
    expect(
      localEntryToCatalogEntry(localEntry({ reasoningCapable: true })),
    ).toMatchObject({
      reasoning: true,
      modelSpec: { reasoning: true },
    });
  });

  it("projects the Codex 6.1 Sol registry entry and all enabled effort levels", async () => {
    const catalog = await getModelCatalog();
    const sol = catalog.models.find(
      (model) => model.ref === DEFAULT_AGENT_MODEL_REF,
    );

    expect(DEFAULT_AGENT_MODEL_REF).toBe("openai-codex:gpt-6.1-sol");
    expect(
      catalog.providers.find((provider) => provider.id === "openai-codex")
        ?.label,
    ).toBe("ChatGPT");
    expect(sol).toMatchObject({
      id: "gpt-6.1-sol",
      provider: "openai-codex",
      contextWindow: 272_000,
      thinkingLevels: ["minimal", "low", "medium", "high", "xhigh", "max"],
      modelSpec: {
        serviceTiers: ["priority"],
        thinkingLevelMap: { minimal: "low", xhigh: "xhigh", max: "max" },
      },
    });
  }, 30_000);

  it("reads the configured workspace default agent config (model + behavior)", async () => {
    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: {
        model: "anthropic:claude-opus-4-1",
        thinkingLevel: "high",
        approvalLevel: 1,
      },
    };
    const { call } = await createTestDO(TestModelSettingsDO);

    await expect(call("getSettings")).resolves.toMatchObject({
      defaultModel: "anthropic:claude-opus-4-1",
      defaultModelSource: "workspace",
      defaultAgentConfig: {
        model: "anthropic:claude-opus-4-1",
        thinkingLevel: "high",
        approvalLevel: 1,
      },
    });
  });

  it("defaults supported Codex models to standard mode without overriding an opt-in", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    const { call } = await createTestDO(CodexModelSettingsDO);

    await expect(call("getSettings")).resolves.toMatchObject({
      defaultAgentConfig: {
        model: "openai-codex:gpt-6.1-sol",
        fastMode: false,
      },
    });

    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: {
        model: "openai-codex:gpt-6.1-sol",
        fastMode: true,
      },
    };
    await expect(call("getSettings")).resolves.toMatchObject({
      defaultAgentConfig: {
        model: "openai-codex:gpt-6.1-sol",
        fastMode: true,
      },
    });
  });

  it("returns the same resolved Fast mode that a subsequent settings read observes", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    TestModelSettingsDO.writes = [];
    const { call } = await createTestDO(CodexModelSettingsDO);

    await expect(
      call("setDefaultAgentConfig", { model: "openai-codex:gpt-6.1-sol" }),
    ).resolves.toMatchObject({
      defaultAgentConfig: {
        model: "openai-codex:gpt-6.1-sol",
        fastMode: false,
      },
    });
    expect(TestModelSettingsDO.writes.at(-1)?.value).toEqual({
      model: "openai-codex:gpt-6.1-sol",
      fastMode: false,
    });

    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: TestModelSettingsDO.writes.at(-1)
        ?.value as DefaultAgentConfig,
    };
    await expect(call("getSettings")).resolves.toMatchObject({
      defaultAgentConfig: {
        model: "openai-codex:gpt-6.1-sol",
        fastMode: false,
      },
    });
  });

  it("inspects only requested model availability without transporting the catalog", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    const { call } = await createTestDO(TestModelSettingsDO);

    await expect(
      call("inspectModels", ["openai:gpt-5", "missing:model", "openai:gpt-5"]),
    ).resolves.toEqual({
      defaultModel: "openai:gpt-5",
      models: [
        {
          ref: "openai:gpt-5",
          availability: { state: "ready", detail: "credentialed" },
        },
        {
          ref: "missing:model",
          availability: { state: "error", message: "Unknown model ref" },
        },
      ],
    });
  });

  it("falls back when the configured model is missing, keeping valid behavior", async () => {
    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: { model: "missing:model", thinkingLevel: "low" },
    };
    const { call } = await createTestDO(TestModelSettingsDO);

    await expect(call("getSettings")).resolves.toMatchObject({
      defaultModel: "openai:gpt-5",
      defaultModelSource: "fallback",
      invalidDefaultModel: "missing:model",
      defaultAgentConfig: { model: "openai:gpt-5", thinkingLevel: "low" },
    });
  });

  it("uses an available local model without overwriting the disconnected preference", async () => {
    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: { model: "openai:gpt-5", thinkingLevel: "low" },
    };
    const { call } = await createTestDO(OfflineModelSettingsDO);

    await expect(call("getSettings")).resolves.toMatchObject({
      defaultModel: "local:lfm2.5-2.6b",
      defaultModelSource: "fallback",
      defaultModelFallbackReason: "unavailable",
      invalidDefaultModel: "openai:gpt-5",
      defaultAgentConfig: { model: "local:lfm2.5-2.6b", fastMode: false },
      catalog: {
        models: expect.arrayContaining([
          expect.objectContaining({
            ref: "openai:gpt-5",
            availability: { state: "needs-setup", detail: "no-credential" },
          }),
        ]),
      },
    });
  });

  it("uses a connected provider when Codex is disconnected and restores the preference when usable", async () => {
    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: {
        model: CODEX_CATALOG_ENTRY.ref,
        thinkingLevel: "max",
        fastMode: true,
      },
    };
    class MixedModelSettingsDO extends TestModelSettingsDO {
      protected override getCatalog(): Promise<ModelCatalog> {
        return Promise.resolve({
          ...CATALOG,
          models: [CODEX_CATALOG_ENTRY, ...CATALOG.models],
        });
      }
      static connected = false;
      protected override storedCredentials(): Promise<
        StoredCredentialSummary[]
      > {
        return Promise.resolve([
          storedCredential("anthropic", "https://api.anthropic.com/v1"),
          ...(MixedModelSettingsDO.connected
            ? [storedCredential("codex", CODEX_CATALOG_ENTRY.baseUrl)]
            : []),
        ]);
      }
    }
    const { call } = await createTestDO(MixedModelSettingsDO);
    await expect(call("getSettings")).resolves.toMatchObject({
      defaultModel: "anthropic:claude-opus-4-1",
      defaultModelFallbackReason: "unavailable",
      defaultAgentConfig: {
        model: "anthropic:claude-opus-4-1",
        fastMode: false,
      },
    });
    expect(TestModelSettingsDO.config.defaultAgentConfig?.model).toBe(
      CODEX_CATALOG_ENTRY.ref,
    );
    MixedModelSettingsDO.connected = true;
    await expect(call("getSettings")).resolves.toMatchObject({
      defaultModel: CODEX_CATALOG_ENTRY.ref,
      defaultModelSource: "workspace",
      defaultAgentConfig: { thinkingLevel: "max", fastMode: true },
    });
  });

  it("keeps the chosen setup target when no model is usable", async () => {
    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: { model: "anthropic:claude-opus-4-1" },
    };
    class DisconnectedModelSettingsDO extends TestModelSettingsDO {
      protected override storedCredentials(): Promise<
        StoredCredentialSummary[]
      > {
        return Promise.resolve([]);
      }
    }
    const { call } = await createTestDO(DisconnectedModelSettingsDO);
    await expect(call("getSettings")).resolves.toMatchObject({
      defaultModel: "anthropic:claude-opus-4-1",
      defaultModelSource: "workspace",
    });
  });

  it("never selects a usable model without agent tools over a usable agent model", () => {
    const noTools = { ...CODEX_CATALOG_ENTRY, capabilities: { tools: false } };
    expect(
      pickFallbackModel({ providers: [], models: [noTools, ...CATALOG.models] })
        .ref,
    ).toBe("openai:gpt-5");
    expect(
      pickFallbackModel({
        providers: [],
        models: [CODEX_CATALOG_ENTRY, ...CATALOG.models],
      }).ref,
    ).toBe(CODEX_CATALOG_ENTRY.ref);
  });

  it("falls back to the local floor when nothing is credentialed (offline first-run)", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    const { call } = await createTestDO(OfflineModelSettingsDO);

    const snapshot = await call("getSettings");
    expect(snapshot).toMatchObject({
      defaultModel: "local:lfm2.5-2.6b",
      defaultModelSource: "fallback",
    });
    const catalog = (snapshot as { catalog: ModelCatalog }).catalog;
    expect(
      catalog.providers.find((provider) => provider.id === "local")?.label,
    ).toBe("Local inference (experimental)");
    const local = catalog.models.find((m) => m.ref === "local:lfm2.5-2.6b");
    expect(local).toMatchObject({
      auth: "loopback",
      availability: { state: "ready" },
      tokensPerSec: 18.4,
      capabilities: { tools: true },
    });
    // Cloud entries degrade to needs-setup without credentials.
    const cloud = catalog.models.find((m) => m.ref === "openai:gpt-5");
    expect(cloud?.availability).toMatchObject({ state: "needs-setup" });
    // The journaled spec is secret-free by construction.
    expect(JSON.stringify(local?.modelSpec)).not.toMatch(
      /authorization|api[-_]?key/iu,
    );
  });

  it("reports the deterministic inference runtime as usable without a fake credential", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    const { call } = await createTestDO(OfflineModelSettingsDO, {
      VIBESTUDIO_TEST_MODE: "1",
    });

    const snapshot = await call("getSettings");
    expect(snapshot).toMatchObject({
      defaultModel: "openai:gpt-5",
      defaultModelSource: "fallback",
    });
    const catalog = (snapshot as { catalog: ModelCatalog }).catalog;
    expect(
      catalog.models.find((model) => model.ref === "openai:gpt-5")
        ?.availability,
    ).toEqual({
      state: "ready",
      detail: "deterministic-test",
    });
  });

  it("does not report an expired credential without persisted refresh material as ready", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    ExpiredModelSettingsDO.lifecycle = { state: "expired", canRefresh: false };
    const { call } = await createTestDO(ExpiredModelSettingsDO);

    const snapshot = (await call("getSettings")) as { catalog: ModelCatalog };
    expect(
      snapshot.catalog.models.find((model) => model.ref === "openai:gpt-5"),
    ).toMatchObject({
      availability: { state: "needs-setup", detail: "credential-expired" },
    });
  });

  it("keeps an expired credential ready when persisted material can renew it", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    ExpiredModelSettingsDO.lifecycle = { state: "expired", canRefresh: true };
    const { call } = await createTestDO(ExpiredModelSettingsDO);

    const snapshot = (await call("getSettings")) as { catalog: ModelCatalog };
    expect(
      snapshot.catalog.models.find((model) => model.ref === "openai:gpt-5"),
    ).toMatchObject({
      availability: { state: "ready", detail: "credentialed" },
    });
  });

  it("persists validated defaults in service state without changing workspace source", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    TestModelSettingsDO.writes = [];
    const { call } = await createTestDO(TestModelSettingsDO);

    await expect(
      call("setDefaultAgentConfig", {
        model: "anthropic:claude-opus-4-1",
        thinkingLevel: "high",
        fastMode: true,
        approvalLevel: 2,
      }),
    ).resolves.toMatchObject({
      defaultModel: "anthropic:claude-opus-4-1",
      defaultModelSource: "workspace",
      defaultAgentConfig: {
        model: "anthropic:claude-opus-4-1",
        thinkingLevel: "high",
        fastMode: true,
        approvalLevel: 2,
      },
    });
    expect(TestModelSettingsDO.writes).toEqual([
      {
        key: "defaultAgentConfig",
        value: {
          model: "anthropic:claude-opus-4-1",
          thinkingLevel: "high",
          fastMode: true,
          approvalLevel: 2,
        },
      },
    ]);
    expect(TestModelSettingsDO.config.defaultAgentConfig).toBeUndefined();
  });

  it("remembers the first successful model and keeps it after later successes", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    TestModelSettingsDO.writes = [];
    const { call } = await createTestDO(TestModelSettingsDO);

    await call("initializeDefaultAgentModel", "anthropic:claude-opus-4-1");
    await call("initializeDefaultAgentModel", "openai:gpt-5");
    expect(TestModelSettingsDO.writes).toEqual([
      {
        key: "defaultAgentConfig",
        value: { model: "anthropic:claude-opus-4-1", fastMode: false },
      },
    ]);
    await expect(call("getSettings")).resolves.toMatchObject({
      defaultModel: "anthropic:claude-opus-4-1",
      defaultModelSource: "workspace",
    });

    await call("setDefaultAgentConfig", {
      model: "openai:gpt-5",
      thinkingLevel: "high",
    });
    await call("initializeDefaultAgentModel", "anthropic:claude-opus-4-1");
    await expect(call("getSettings")).resolves.toMatchObject({
      defaultAgentConfig: {
        model: "openai:gpt-5",
        thinkingLevel: "high",
        fastMode: false,
      },
    });
    expect(TestModelSettingsDO.config.defaultAgentConfig).toBeUndefined();
  });

  it("retains the learned model across activation and later template default changes", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    const first = await createTestDO(TestModelSettingsDO);
    await first.call(
      "initializeDefaultAgentModel",
      "anthropic:claude-opus-4-1",
    );
    expect(TestModelSettingsDO.config.defaultAgentConfig).toBeUndefined();
    const reopened = await createTestDO(TestModelSettingsDO, undefined, {
      db: first.db,
    });
    await expect(reopened.call("getSettings")).resolves.toMatchObject({
      defaultModel: "anthropic:claude-opus-4-1",
      defaultModelSource: "workspace",
    });
    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: { model: "openai:gpt-5" },
    };
    await expect(reopened.call("getSettings")).resolves.toMatchObject({
      defaultModel: "anthropic:claude-opus-4-1",
    });
  });

  it("keeps explicit defaults even when their model is unavailable", async () => {
    const saved = {
      model: CODEX_CATALOG_ENTRY.ref,
      thinkingLevel: "high" as const,
    };
    TestModelSettingsDO.config = { ...BASE_CONFIG, defaultAgentConfig: saved };
    TestModelSettingsDO.writes = [];
    const { call } = await createTestDO(TestModelSettingsDO);

    await call("initializeDefaultAgentModel", "anthropic:claude-opus-4-1");
    expect(TestModelSettingsDO.config.defaultAgentConfig).toEqual(saved);
    expect(TestModelSettingsDO.writes).toEqual([]);
  });

  it("persists extended effort levels", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    TestModelSettingsDO.writes = [];
    const { call } = await createTestDO(TestModelSettingsDO);

    await call("setDefaultAgentConfig", {
      model: "openai:gpt-5",
      thinkingLevel: "max",
      approvalLevel: 2,
    });

    expect(TestModelSettingsDO.writes).toEqual([
      {
        key: "defaultAgentConfig",
        value: {
          model: "openai:gpt-5",
          thinkingLevel: "max",
          fastMode: false,
          approvalLevel: 2,
        },
      },
    ]);
  });

  it("rejects invalid behavior fields instead of silently dropping them", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    TestModelSettingsDO.writes = [];
    const { call } = await createTestDO(TestModelSettingsDO);

    await expect(
      call("setDefaultAgentConfig", {
        model: "openai:gpt-5",
        thinkingLevel: "bogus",
        approvalLevel: 9,
      }),
    ).rejects.toThrow(/thinkingLevel/);
    expect(TestModelSettingsDO.writes).toEqual([]);
  });

  it("rejects malformed stored configuration instead of normalizing it", async () => {
    TestModelSettingsDO.config = {
      ...BASE_CONFIG,
      defaultAgentConfig: { model: "openai:gpt-5", retiredField: true },
    } as never;
    const { call } = await createTestDO(TestModelSettingsDO);
    await expect(call("getSettings")).rejects.toThrow(/unknown field/);
  });

  it("rejects unknown default model refs", async () => {
    TestModelSettingsDO.config = { ...BASE_CONFIG };
    const { call } = await createTestDO(TestModelSettingsDO);

    await expect(
      call("setDefaultAgentConfig", { model: "missing:model" }),
    ).rejects.toThrow("Unknown model ref: missing:model");
  });
});

it("resolves account-specific endpoint templates without exposing secret material", () => {
  const baseUrl =
    "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1";
  const expected =
    "https://api.cloudflare.com/client/v4/accounts/account123/ai/v1";
  const credential = {
    ...storedCredential("cloudflare", expected),
    metadata: {
      modelProviderId: "cloudflare-workers-ai",
      modelAuthMethod: "api-key",
      modelProviderConfig: JSON.stringify({
        CLOUDFLARE_ACCOUNT_ID: "account123",
      }),
    },
  };
  const entry = makeTestCatalogEntry({
    ref: "cloudflare-workers-ai:model",
    id: "model",
    name: "Test model",
    provider: "cloudflare-workers-ai",
    baseUrl,
    availability: { state: "needs-setup", detail: "no-credential" },
  });
  expect(
    applyCloudAvailability(entry, [credential], "provider-credentials"),
  ).toMatchObject({
    baseUrl: expected,
    modelSpec: { baseUrl: expected },
    availability: { state: "ready" },
    connection: { configuration: { CLOUDFLARE_ACCOUNT_ID: "account123" } },
  });
});

it("shows account model restrictions instead of marking every Copilot model ready", () => {
  const baseUrl = "https://api.individual.githubcopilot.com";
  const credential = {
    ...storedCredential("copilot", baseUrl),
    metadata: {
      modelProviderId: "github-copilot",
      modelAvailableIds: JSON.stringify(["gpt-6.1-sol"]),
    },
  };
  const entry = makeTestCatalogEntry({
    ref: "github-copilot:claude-opus-5-5",
    name: "Claude Opus 5.5",
    id: "claude-opus-5-5",
    provider: "github-copilot",
    baseUrl,
  });
  expect(
    applyCloudAvailability(entry, [credential], "provider-credentials")
      .availability,
  ).toMatchObject({
    state: "error",
    message: expect.stringContaining(
      "not available with your connected provider account",
    ),
  });
  expect(
    applyCloudAvailability(
      { ...entry, id: "gpt-6.1-sol" },
      [credential],
      "provider-credentials",
    ).availability.state,
  ).toBe("ready");
});

class DiscoveryModelSettingsDO extends ModelSettingsDO {
  static config: WorkspaceConfig = BASE_CONFIG;
  static configReads = 0;
  protected override getCatalog(): Promise<ModelCatalog> {
    return Promise.resolve(CATALOG);
  }
  protected override getWorkspaceConfig(): Promise<WorkspaceConfig> {
    DiscoveryModelSettingsDO.configReads += 1;
    return Promise.resolve(DiscoveryModelSettingsDO.config);
  }
}

const localUnit = {
  name: "@workspace-extensions/local-models",
  kind: "extension",
  target: null,
  capabilities: [],
  source: "extensions/local-models",
  displayName: "Local Models",
  isAgent: false,
  status: "ready",
  effectiveVersion: "local-version",
  activeBuildKey: "local-build",
  lastError: null,
  pendingApproval: null,
  authorityRows: [],
};

async function discoveryFixture(
  config: Partial<WorkspaceConfig>,
  opts: {
    units?: unknown;
    entries?: unknown;
    credentials?: unknown;
    failureMethod?: string;
    failure?: Error;
  } = {},
) {
  DiscoveryModelSettingsDO.config = { ...BASE_CONFIG, ...config };
  DiscoveryModelSettingsDO.configReads = 0;
  const calls: string[] = [];
  const fixture = await createTestDO(DiscoveryModelSettingsDO);
  void (fixture.instance as unknown as { rpc: unknown }).rpc;
  const connectionless = (
    fixture.instance as unknown as {
      _connectionless: {
        client: { call: (target: string, method: string) => Promise<unknown> };
      };
    }
  )._connectionless;
  connectionless.client.call = async (_target, method) => {
    calls.push(method);
    if (method === opts.failureMethod) throw opts.failure;
    if (method === "credentials.listStoredCredentials")
      return opts.credentials ?? [];
    if (method === "build.listUnits") return opts.units ?? [localUnit];
    if (method === "extensions.invoke") return opts.entries ?? [];
    throw new Error(`Unexpected metadata RPC ${method}`);
  };
  return { ...fixture, calls };
}

describe("model discovery evidence and original failures", () => {
  it("proves optional absence from effective declarations without invoking an undeclared source", async () => {
    const f = await discoveryFixture({ extensions: [] });
    await f.call("getSettings");
    expect(f.calls).toEqual(["credentials.listStoredCredentials"]);
    expect(DiscoveryModelSettingsDO.configReads).toBe(1);
  });
  it("does not treat an unrelated declaration as an installed local provider", async () => {
    const f = await discoveryFixture({
      extensions: [{ source: "extensions/other" }],
    });
    await f.call("getSettings");
    expect(f.calls).not.toContain("extensions.invoke");
  });
  it("preserves an inherited configured local model from the same effective declaration read", async () => {
    const entry = localEntry();
    const f = await discoveryFixture(
      {
        extensions: [
          { source: "extensions/base" },
          { source: "extensions/local-models" },
        ],
        defaultAgentConfig: { model: `local:${entry.slug}` },
      },
      { entries: [entry] },
    );
    await expect(f.call("getSettings")).resolves.toMatchObject({
      defaultModel: `local:${entry.slug}`,
      defaultModelSource: "workspace",
    });
    expect(DiscoveryModelSettingsDO.configReads).toBe(1);
  });
  it("reports the exact declared source when its valid canonical build unit is absent", async () => {
    const f = await discoveryFixture(
      { extensions: [{ source: "extensions/local-models" }] },
      { units: [] },
    );
    await expect(f.call("getSettings")).rejects.toThrow(
      "Declared local model provider extensions/local-models has no valid extension build unit @workspace-extensions/local-models",
    );
    expect(f.calls).not.toContain("extensions.invoke");
  });
  it.each(["approval pending", "provider disconnected", "activation failed"])(
    "propagates original %s instead of substituting cloud inventory",
    async (message) => {
      const f = await discoveryFixture(
        {
          extensions: [{ source: "extensions/local-models" }],
          defaultAgentConfig: { model: "local:lfm2.5-2.6b" },
        },
        { failureMethod: "extensions.invoke", failure: new Error(message) },
      );
      await expect(f.call("getSettings")).rejects.toThrow(message);
    },
  );
  it("propagates the original declaration inventory failure", async () => {
    const f = await discoveryFixture(
      { extensions: [{ source: "extensions/local-models" }] },
      {
        failureMethod: "build.listUnits",
        failure: new Error("source discovery failed"),
      },
    );
    await expect(f.call("getSettings")).rejects.toThrow(
      "source discovery failed",
    );
  });
  it.each([
    {
      entries: { bad: "inventory" },
      reason: "Expected array, received object",
    },
    { entries: [{ slug: "missing-metadata" }], reason: "displayName" },
  ])("rejects malformed local inventory %#", async ({ entries, reason }) => {
    const f = await discoveryFixture(
      { extensions: [{ source: "extensions/local-models" }] },
      { entries },
    );
    await expect(f.call("getSettings")).rejects.toThrow(reason);
    expect(f.calls).toContain("extensions.invoke");
  });
  it("propagates credential metadata failure instead of claiming no account", async () => {
    const f = await discoveryFixture(
      {},
      {
        failureMethod: "credentials.listStoredCredentials",
        failure: new Error("credential inventory disconnected"),
      },
    );
    await expect(f.call("getSettings")).rejects.toThrow(
      "credential inventory disconnected",
    );
  });
  it("rejects malformed credential inventory", async () => {
    const f = await discoveryFixture(
      {},
      { credentials: [{ id: "incomplete" }] },
    );
    await expect(f.call("getSettings")).rejects.toThrow("injection");
    expect(f.calls).toContain("credentials.listStoredCredentials");
  });
  it("keeps a successful empty local inventory authoritative", async () => {
    const f = await discoveryFixture(
      { extensions: [{ source: "extensions/local-models" }] },
      { entries: [] },
    );
    await expect(f.call("getSettings")).resolves.toMatchObject({
      defaultModelSource: "fallback",
    });
    expect(f.calls).toContain("extensions.invoke");
  });
});
