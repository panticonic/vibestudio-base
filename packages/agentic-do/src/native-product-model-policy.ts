import type { ModelThinkingLevel } from "@panticonic/pi-ai";
import { copyJson, type JsonRepresentation } from "@panticonic/pi-chord";
import {
  defineDoc,
  defineDocFamily,
  GenerationTask,
  hook,
  type ConversationId,
  type ConversationStreamOptions,
  type HarnessCommit,
  type ModelRef,
  type Tx,
} from "@panticonic/pi-durable";
import {
  classifyModelFailure,
  type ModelFailureClass,
} from "@workspace/agentic-core/model-failures";
import { modelServiceTiers } from "@workspace/model-catalog/catalog";
import { nativeProductTask } from "./native-product-context.js";

export interface NativeProductModelSettings {
  primaryModel: ModelRef;
  fallbackModel?: ModelRef;
  fallbackThinkingLevel?: ModelThinkingLevel;
  fallbackOn?: ModelFailureClass[];
  fallbackScope: "unattended" | "all-turns";
  fastMode: boolean;
}
const providerFailures = new Set<ModelFailureClass>([
  "usage_limit_terminal",
  "quota_exhausted_terminal",
  "rate_limited_retryable",
  "provider_overloaded_retryable",
  "auth_or_credentials",
  "circuit_breaker_open_retryable",
  "unknown_retryable",
]);
type Policy = {
  settings: JsonRepresentation<NativeProductModelSettings> | null;
  origin: "scheduled" | "agent-initiated" | null;
};
const Config = defineDoc<{
  settings: JsonRepresentation<NativeProductModelSettings> | null;
}>({
  kind: "vibestudio.product-model-configuration",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ settings: null }),
  checkpointWhen: () => true,
});
const InputPolicy = defineDocFamily<Policy, null>({
  kind: "vibestudio.product-input-model-policy",
  version: 1,
  scope: "session",
  family: true,
  initial: () => ({ settings: null, origin: null }),
  checkpointWhen: () => true,
});
const TaskPolicy = defineDoc<Policy>({
  kind: "vibestudio.product-task-model-policy",
  version: 1,
  scope: "task",
  initial: () => ({ settings: null, origin: null }),
  checkpointWhen: () => true,
});

/** Each channel's real stream policy is selected before native request preparation. */
export function nativeProductStream(
  provider: string,
  modelId: string,
  fastMode: boolean,
): ConversationStreamOptions {
  return fastMode && modelServiceTiers(provider, modelId).includes("priority")
    ? { serviceTier: "priority" }
    : {};
}

/** Product choices accompany the original input run; the native generation remains its sole execution owner. */
export function createNativeProductModelPolicy() {
  return {
    configure: async (
      tx: Tx,
      conversationId: ConversationId,
      settings: NativeProductModelSettings,
    ): Promise<void> => {
      for (const model of [settings.primaryModel, settings.fallbackModel])
        if (model && (!model.provider || !model.modelId))
          throw new Error(
            "Model policy requires a concrete selected provider and model",
          );
      const config = await tx.doc(Config, conversationId);
      config.settings = copyJson(settings, {
        omitUndefinedProperties: true,
      }) as JsonRepresentation<NativeProductModelSettings>;
    },
    prepareCommit: async (tx: Tx, staged: HarnessCommit): Promise<void> => {
      for (const task of staged.tasks) {
        if (
          task.kind !== GenerationTask.definition.name ||
          task.state.status !== "pending"
        )
          continue;
        const product = await nativeProductTask(tx, task.id);
        const inputId = product.inputs[0];
        if (inputId === undefined)
          throw new Error("Model policy has no actual original native input");
        const original = await tx.doc(InputPolicy, String(inputId), null);
        if (original.settings === null) {
          const configured = (await tx.doc(Config, task.conversationId))
            .settings;
          if (configured === null)
            throw new Error(
              "Native model policy has no original channel configuration",
            );
          original.settings = configured;
          original.origin = product.metadata?.origin ?? null;
        }
        const policy = await tx.doc(TaskPolicy, task.id);
        policy.settings = original.settings;
        policy.origin = original.origin;
      }
    },
    generationHooks: hook(GenerationTask, {
      afterResponse: async (message, api, context, request) => {
        if (message.stopReason !== "error") return;
        const policy = await api.snapshot(TaskPolicy, api.taskId, context);
        const settings = policy?.settings;
        if (
          !settings?.fallbackModel ||
          (settings.fallbackScope !== "all-turns" &&
            policy?.origin !== "scheduled")
        )
          return;
        if (
          request.model.provider !== settings.primaryModel.provider ||
          request.model.id !== settings.primaryModel.modelId
        )
          return;
        if (
          settings.fallbackModel.provider === request.model.provider &&
          settings.fallbackModel.modelId === request.model.id
        )
          return;
        const failure = classifyModelFailure({
          provider: message.provider,
          model: message.model,
          message: message.errorMessage,
        });
        if (
          settings.fallbackOn
            ? !settings.fallbackOn.includes(failure.code)
            : !providerFailures.has(failure.code)
        )
          return;
        return {
          retry: {
            model: settings.fallbackModel,
            thinkingLevel:
              settings.fallbackThinkingLevel ?? request.thinkingLevel,
            // Explicit undefined clears a primary Codex-only tier before the native JSON pin.
            stream: {
              ...request.streamOptions,
              serviceTier: undefined,
              ...nativeProductStream(
                settings.fallbackModel.provider,
                settings.fallbackModel.modelId,
                settings.fastMode,
              ),
            },
          },
        };
      },
    }),
  };
}
