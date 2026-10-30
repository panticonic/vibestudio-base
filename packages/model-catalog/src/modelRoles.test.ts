import { describe, expect, it } from "vitest";
import {
  LOCAL_PROVIDER_ID,
  TEST_MODEL_PROVIDER_ID,
  canonicalModelRef,
  type ModelCatalog,
  type ModelCatalogEntry,
} from "./catalog.js";
import {
  EXECUTOR_LOCAL_MODEL,
  isModelRole,
  lowTierHostedModel,
  resolveModelRole,
} from "./modelRoles.js";
import { makeTestCatalogEntry } from "./testing.js";

function entry(
  provider: string,
  id: string,
  fields: Partial<ModelCatalogEntry> = {},
  cost: { input: number; output: number } = { input: 1, output: 1 },
): ModelCatalogEntry {
  const base = makeTestCatalogEntry({
    ref: canonicalModelRef(provider, id),
    id,
    name: id,
    provider,
    baseUrl: `https://${provider}.test/v1`,
    ...fields,
  });
  return {
    ...base,
    modelSpec: {
      ...base.modelSpec,
      cost: { ...base.modelSpec.cost, ...cost },
    },
  };
}

const catalogOf = (...models: ModelCatalogEntry[]): ModelCatalog => ({
  providers: [],
  models,
});

const localExecutor = (state: "ready" | "startable" | "not-installed") =>
  entry(
    LOCAL_PROVIDER_ID,
    EXECUTOR_LOCAL_MODEL.id,
    {
      auth: "loopback",
      connectable: false,
      availability:
        state === "ready"
          ? { state: "ready", detail: "running" }
          : state === "startable"
            ? { state: "startable", detail: "will-load-on-use" }
            : { state: "needs-setup", detail: "not-installed" },
    },
    { input: 0, output: 0 },
  );

describe("model roles", () => {
  it("names the executor role", () => {
    expect(isModelRole("executor")).toBe(true);
    expect(isModelRole("smart")).toBe(false);
  });

  it("resolves the executor to the local model while local-models reports it ready", () => {
    const catalog = catalogOf(
      entry("openai", "big", {}, { input: 5, output: 15 }),
      entry("openai", "small", {}, { input: 0.1, output: 0.4 }),
      localExecutor("ready"),
    );
    expect(resolveModelRole("executor", catalog, "openai:big")).toMatchObject({
      role: "executor",
      ref: EXECUTOR_LOCAL_MODEL.ref,
      source: "local",
    });
  });

  it("resolves the executor to an installed local model that loads on first use", () => {
    const catalog = catalogOf(
      entry("openai", "small", {}, { input: 0.1, output: 0.4 }),
      localExecutor("startable"),
    );
    expect(resolveModelRole("executor", catalog, "openai:small")).toMatchObject({
      ref: EXECUTOR_LOCAL_MODEL.ref,
      source: "local",
    });
  });

  it.each(["not-installed"] as const)(
    "falls back to the billed low-tier hosted model when the local model is %s",
    (state) => {
      const catalog = catalogOf(
        entry("openai", "big", {}, { input: 5, output: 15 }),
        entry("openai", "small", {}, { input: 0.1, output: 0.4 }),
        localExecutor(state),
      );
      expect(resolveModelRole("executor", catalog, "openai:big")).toMatchObject({
        ref: "openai:small",
        source: "hosted",
      });
    },
  );

  it("takes low tier from catalog prices, preferring the default model's connected account", () => {
    const catalog = catalogOf(
      entry("openai", "big", {}, { input: 5, output: 15 }),
      entry("openai", "mid", {}, { input: 1, output: 4 }),
      entry("groq", "tiny", {}, { input: 0.05, output: 0.08 }),
    );
    expect(lowTierHostedModel(catalog, "openai:big")?.ref).toBe("openai:mid");
    expect(lowTierHostedModel(catalog, null)?.ref).toBe("groq:tiny");
  });

  it("only considers usable, tool-capable hosted models", () => {
    const catalog = catalogOf(
      entry(
        "openai",
        "unconnected",
        { availability: { state: "needs-setup", detail: "no-credential" } },
        { input: 0.01, output: 0.01 },
      ),
      entry(
        "openai",
        "no-tools",
        { capabilities: { tools: false } },
        { input: 0.01, output: 0.01 },
      ),
      entry("openai", "ok", {}, { input: 2, output: 8 }),
    );
    expect(lowTierHostedModel(catalog, null)?.ref).toBe("openai:ok");
  });

  it("prefers a non-reasoning model at equal price and breaks ties by ref", () => {
    const catalog = catalogOf(
      entry("p", "think", { reasoning: true }),
      entry("p", "b-plain"),
      entry("p", "a-plain"),
    );
    expect(lowTierHostedModel(catalog, null)?.ref).toBe("p:a-plain");
  });

  it("labels the deterministic provider as a test source", () => {
    const catalog = catalogOf(
      entry(TEST_MODEL_PROVIDER_ID, "deterministic", {
        auth: "none",
        availability: { state: "ready", detail: "deterministic-test" },
      }),
    );
    expect(resolveModelRole("executor", catalog, null)).toMatchObject({
      ref: "vibestudio-test:deterministic",
      source: "test",
    });
  });

  it("reports an unavailable executor with a reason instead of inventing one", () => {
    const resolution = resolveModelRole("executor", catalogOf(localExecutor("not-installed")), null);
    expect(resolution).toMatchObject({ ref: null, source: "unavailable", model: null });
    expect(resolution.reason).toMatch(/Connect a provider/u);
  });
});
