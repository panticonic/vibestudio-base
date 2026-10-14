import type { Models } from "@panticonic/pi-ai";
import { canonicalModelRef } from "@workspace/model-catalog/catalog";
import {
  getProviderConnectPreset,
  modelProviderLabel,
} from "@workspace/model-catalog/providerConnect";
import type { MaterializedModel } from "./model-spec.js";

/** Credential cards use the same materialized catalog and connection presets as execution. */
export function nativeCredentialProviderOptions(
  models: Models,
  materialize: (ref: string) => MaterializedModel | null,
  requestedModelRef: string,
) {
  return models
    .getModels()
    .flatMap((model) => {
      const ref = canonicalModelRef(model.provider, model.id);
      const spec = materialize(ref)?.spec;
      const method = getProviderConnectPreset(model.provider)?.methods[0];
      return spec && method
        ? [
            {
              providerId: spec.provider,
              providerLabel: modelProviderLabel(spec.provider),
              modelRef: ref,
              modelName: spec.name,
              modelBaseUrl: spec.baseUrl,
              flow: method.flow,
            },
          ]
        : [];
    })
    .sort((left, right) =>
      left.modelRef === requestedModelRef
        ? -1
        : right.modelRef === requestedModelRef
          ? 1
          : left.providerLabel.localeCompare(right.providerLabel) ||
            left.modelName.localeCompare(right.modelName),
    );
}
