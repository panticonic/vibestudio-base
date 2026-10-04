import type { Context, JsonValue } from "@panticonic/pi-chord";
import type { TSchema } from "@panticonic/pi-ai";
import type {
  ToolExecutionApi,
  ToolRegistration,
} from "@panticonic/pi-durable";

/**
 * Capture one phase's selected factory and immutable resource choices. Bind only
 * its execution dependencies at invocation; never rediscover the agent's tools.
 */
export function authorNativeTool<
  TParameters extends TSchema,
  TDetails extends JsonValue,
  TBinding,
>(
  make: (
    binding: TBinding | undefined,
  ) => ToolRegistration<TParameters, TDetails>,
  bind: (
    api: ToolExecutionApi<TDetails>,
    context: Context,
  ) => Promise<TBinding>,
): ToolRegistration<TParameters, TDetails> {
  const offered = make(undefined);
  return {
    ...offered,
    // Stateful tools share one workspace/scope. Only tools that explicitly
    // declare parallel safety may overlap in a model's tool-call batch.
    executionMode: offered.executionMode ?? "sequential",
    execute: async (args, api, context) => {
      const implementation = make(await bind(api, context));
      return implementation.execute(args, api, context);
    },
    ...(offered.cancel
      ? {
          cancel: async (args, api, context) => {
            const implementation = make(await bind(api, context));
            if (!implementation.cancel)
              throw new Error(
                "Native tool factory changed its cancellation contract",
              );
            return implementation.cancel(args, api, context);
          },
        }
      : {}),
  };
}
