import { describe, expect, it } from "vitest";
import type {
  ModelCatalogEntry,
  ModelCatalogProvider,
} from "@workspace/agentic-core";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import {
  modelRefForProvider,
  orderModelPickerProviders,
  orderProviderModels,
} from "./ModelPicker";

function provider(
  id: string,
  label: string,
  recommendedModelRef: string | null,
): ModelCatalogProvider {
  return {
    id,
    label,
    recommendedModelRef,
    baseUrls: [],
    connectable: id !== "local",
  };
}

function model(
  ref: string,
  name: string,
  availability: ModelCatalogEntry["availability"],
  recommended = false,
): ModelCatalogEntry {
  const separator = ref.indexOf(":");
  return makeTestCatalogEntry({
    ref,
    id: ref.slice(separator + 1),
    provider: ref.slice(0, separator),
    name,
    baseUrl: `https://${ref.slice(0, separator)}.example.com`,
    availability,
    recommended,
  });
}

describe("provider/model picker ordering", () => {
  const codex = provider(
    "openai-codex",
    "GPT Codex",
    "openai-codex:gpt-5.6-sol",
  );
  const mistral = provider("mistral", "Mistral", "mistral:large");
  const local = provider("local", "Local inference", "local:bonsai-8b");

  it("keeps the workspace-recommended provider first and experimental local last", () => {
    expect(
      orderModelPickerProviders(
        [local, mistral, codex],
        "openai-codex:gpt-5.6-sol",
      ).map((entry) => entry.id),
    ).toEqual(["openai-codex", "mistral", "local"]);
  });

  it("orders newer versions first regardless of recommendation or availability", () => {
    const readyNewer = model("openai-codex:gpt-5.5", "GPT-5.5", {
      state: "ready",
      detail: "credentialed",
    });
    const recommended = model(
      "openai-codex:gpt-5.4-sol",
      "GPT-5.4 Sol",
      { state: "needs-setup", detail: "no-credential" },
      true,
    );

    expect(
      orderProviderModels([readyNewer, recommended]).map((entry) => entry.ref),
    ).toEqual([readyNewer.ref, recommended.ref]);
  });

  it("selects a provider's recommendation when the provider changes", () => {
    const fallback = model("mistral:small", "Mistral Small", {
      state: "ready",
      detail: "credentialed",
    });
    const recommended = model(
      "mistral:large",
      "Mistral Large",
      { state: "needs-setup", detail: "no-credential" },
      true,
    );

    expect(
      modelRefForProvider(
        [fallback, recommended],
        mistral,
        "openai-codex:gpt-5.6-sol",
      ),
    ).toBe(recommended.ref);
  });
});
