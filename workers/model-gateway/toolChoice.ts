import type { NativeModelHelperOptions } from "@workspace/agentic-do/native-model-helper";
import type { ModelGatewayTurnOptions } from "@workspace/model-gateway/contract";

/**
 * Pi's neutral `toolChoice` knows only auto and none; each API takes its own word
 * for "must call a tool". This is natlang's `piToolChoiceOptions` table
 * (ts-host/src/model/pi-translation.ts). The vendored natlang core cannot be
 * imported here (its bundle loads the TypeScript compiler), so this single copy
 * stands in until natlang vendors its pure Pi translation as its own target;
 * then this module re-exports it.
 */
function forcedToolChoice(api: string): "any" | "required" | undefined {
  if (
    ["anthropic-messages", "bedrock-converse-stream", "google-generative-ai", "google-vertex"].includes(api)
  )
    return "any";
  if (
    [
      "openai-completions",
      "openai-responses",
      "openai-codex-responses",
      "azure-openai-responses",
      "mistral-conversations",
      "pi-messages",
    ].includes(api)
  )
    return "required";
  return undefined;
}

/** The helper's provider-native options for a caller's options, on a model of `api`. */
export function nativeTurnOptions(
  api: string,
  options: ModelGatewayTurnOptions,
): NativeModelHelperOptions {
  const { toolChoice, ...rest } = options;
  if (toolChoice !== "required") return options as NativeModelHelperOptions;
  const forced = forcedToolChoice(api);
  if (forced === undefined)
    throw new Error(`Models on the ${api} API cannot be forced to call a tool`);
  return { ...rest, toolChoice: forced };
}
