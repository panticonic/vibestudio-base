import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_MODEL_REF } from "@workspace/model-catalog/catalog";
import { getProviderConnectPreset } from "@workspace/model-catalog/providerConnect";
import { createProtectedNativeModels } from "./native-model-provider.js";
import { materializeModel } from "./model-spec.js";
import { nativeCredentialProviderOptions } from "./native-credential-presentation.js";

describe("native credential provider menu", () => {
  it("offers real materialized catalog models with supported connect presets, starting with the requested model", () => {
    const options = nativeCredentialProviderOptions(
      createProtectedNativeModels(),
      (ref) => {
        const separator = ref.indexOf(":");
        return materializeModel(
          ref.slice(0, separator),
          ref.slice(separator + 1),
          null,
        );
      },
      DEFAULT_AGENT_MODEL_REF,
    );
    expect(options[0]?.modelRef).toBe(DEFAULT_AGENT_MODEL_REF);
    expect(
      new Set(options.map((option) => option.providerId)).size,
    ).toBeGreaterThan(1);
    for (const option of options) {
      expect(option.modelRef).toBe(
        `${option.providerId}:${option.modelRef.slice(option.modelRef.indexOf(":") + 1)}`,
      );
      const model = materializeModel(
        option.providerId,
        option.modelRef.slice(option.modelRef.indexOf(":") + 1),
        null,
      );
      expect(option.modelName).toBe(model!.spec.name);
      expect(option.modelBaseUrl).toBe(model!.spec.baseUrl);
      expect(option.flow).toEqual(
        getProviderConnectPreset(option.providerId)!.methods[0]!.flow,
      );
    }
  });
});
