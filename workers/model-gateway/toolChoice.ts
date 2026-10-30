import { piToolChoiceOptions } from "@workspace/natlang-pi";
import type { NativeModelHelperOptions } from "@workspace/agentic-do/native-model-helper";
import type { ModelGatewayTurnOptions } from "@workspace/model-gateway/contract";

/**
 * The helper's provider-native options for a caller's options, on a model of
 * `api`. Pi's neutral `toolChoice` knows only auto and none; each API takes its
 * own word for "must call a tool", which is natlang's table
 * (`piToolChoiceOptions`).
 */
export function nativeTurnOptions(
  api: string,
  options: ModelGatewayTurnOptions,
): NativeModelHelperOptions {
  const { toolChoice, ...rest } = options;
  if (toolChoice !== "required") return options as NativeModelHelperOptions;
  const forced = piToolChoiceOptions(api, { tool_choice: "required" }).toolChoice;
  if (forced === undefined)
    throw new Error(`Models on the ${api} API cannot be forced to call a tool`);
  return { ...rest, toolChoice: forced };
}
