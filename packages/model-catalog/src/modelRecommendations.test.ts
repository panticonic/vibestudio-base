import { describe, expect, it } from "vitest";

import { getBuiltinModels } from "./builtinCatalog";
import { DEFAULT_AGENT_MODEL_REF } from "./catalog";

import { pickRecommendedModelId } from "./modelRecommendations";

describe("modelRecommendations", () => {
  it("prefers flagship provider families over smaller variants", () => {
    expect(
      pickRecommendedModelId("anthropic", [
        { id: "claude-3-5-haiku-latest" },
        { id: "claude-3-5-sonnet-20241022" },
      ]),
    ).toBe("claude-3-5-sonnet-20241022");

    expect(
      pickRecommendedModelId("google", [
        { id: "gemini-2.5-flash" },
        { id: "gemini-2.5-pro" },
      ]),
    ).toBe("gemini-2.5-pro");
  });

  it("selects Sol from the Codex 5.6 flagship variants", () => {
    expect(
      pickRecommendedModelId("openai-codex", [
        { id: "gpt-5.6-luna" },
        { id: "gpt-5.6-terra" },
        { id: "gpt-5.5-codex" },
        { id: "gpt-5.6-sol" },
      ]),
    ).toBe("gpt-5.6-sol");
  });

  it.each([
    ["openai-codex", "gpt-6.1-sol"],
    ["openai", "gpt-6.1-sol"],
    ["anthropic", "claude-opus-5-5"],
    ["github-copilot", "gpt-6.1-sol"],
    ["kimi-coding", "k3-256k"],
    ["meta", "muse-spark-1.3"],
    ["xai", "grok-4.7"],
  ])(
    "selects the current %s recommendation independent of catalog order",
    (provider, id) => {
      const models = getBuiltinModels(provider);
      expect(pickRecommendedModelId(provider, models)).toBe(id);
      expect(pickRecommendedModelId(provider, [...models].reverse())).toBe(id);
    },
  );

  it("uses the recommended Codex model as the new-agent default", () => {
    expect(DEFAULT_AGENT_MODEL_REF).toBe(
      `openai-codex:${pickRecommendedModelId("openai-codex", getBuiltinModels("openai-codex"))}`,
    );
  });

  it("compares minor versions after family preference", () => {
    expect(
      pickRecommendedModelId("anthropic", [
        { id: "claude-opus-5" },
        { id: "claude-opus-5-5" },
        { id: "claude-sonnet-6" },
      ]),
    ).toBe("claude-opus-5-5");
    expect(
      pickRecommendedModelId("xai", [{ id: "grok-4.6" }, { id: "grok-4.7" }]),
    ).toBe("grok-4.7");
  });
});
