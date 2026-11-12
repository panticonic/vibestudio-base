import { createEvalExecutor } from "@vibestudio/service-schemas/eval";
import { createMainRpcCaller } from "@vibestudio/service-schemas/mainRpc";
import { createDurableObjectServiceClient } from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import { deserializeRpcFailure, formatRpcFailure } from "@vibestudio/rpc";
import {
  LOCAL_MODELS_EXTENSION_ID,
  MODEL_SETTINGS_SERVICE_PROTOCOL,
} from "@workspace/model-catalog/catalog";
import { localModelsExtensionMethods } from "@workspace/model-catalog/localModels";
import { modelSettingsRpcMethods } from "@workspace/model-catalog/rpc-contract";
import { createNatlangRecordsClient } from "@workspace/natlang-records/client";
import { extensions, fs, openPanel, panel, rpc } from "@workspace/runtime";
import type { EvalOutcome, EvalRunner, NatlangPanelPorts } from "./ports.js";

/** Run source in this panel's own eval session: the eval owner is the panel, so the natlang provider is the one agents use. */
function panelEvaluate(): EvalRunner {
  const execute = (signal: AbortSignal | undefined) =>
    createEvalExecutor(createMainRpcCaller(rpc), signal ? { signal } : {});
  return async (source, options): Promise<EvalOutcome> => {
    const result = await execute(options.signal)({
      runId: options.runId,
      source: { kind: "inline", code: source, syntax: options.syntax ?? "typescript" },
    });
    return {
      success: result.success,
      console: result.console,
      ...(result.returnValue === undefined ? {} : { returnValue: result.returnValue }),
      ...(result.error ? { error: formatRpcFailure(deserializeRpcFailure(result.error)) } : {}),
      ...(result.natlang ? { natlang: result.natlang } : {}),
    };
  };
}

/** The panel's real ports: the runtime's filesystem, the records and model-settings services, local-models, and eval. */
export function createRuntimePorts(): NatlangPanelPorts {
  const settings = createDurableObjectServiceClient(rpc, MODEL_SETTINGS_SERVICE_PROTOCOL, modelSettingsRpcMethods);
  const localModels = (method: "status" | "listModels" | "capabilities") =>
    extensions.invoke(LOCAL_MODELS_EXTENSION_ID, method, []);
  return {
    fs: fs as unknown as NatlangPanelPorts["fs"],
    records: createNatlangRecordsClient(rpc),
    settings: { resolveRole: (role) => settings.call("resolveRole", role) },
    localModels: {
      status: async () => localModelsExtensionMethods.status.result.parse(await localModels("status")),
      listModels: async () => localModelsExtensionMethods.listModels.result.parse(await localModels("listModels")),
      async openManagement() {
        const { managementPanel } = localModelsExtensionMethods.capabilities.result.parse(await localModels("capabilities"));
        await openPanel(managementPanel.source, {
          focus: true,
          ...(managementPanel.stateArgs ? { stateArgs: managementPanel.stateArgs } : {}),
        });
      },
    },
    evaluate: panelEvaluate(),
    owner: { kind: "panel", objectKey: panel.slotId },
    newId: () => crypto.randomUUID(),
  };
}
