import type {
  AssistantMessage,
  Context,
  SamplingParams,
  ThinkingLevel,
  ToolChoice,
  Usage,
} from "@panticonic/pi-ai";
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import { z } from "zod";

/** Service protocol implemented by the Base model gateway worker. */
export const MODEL_GATEWAY_SERVICE_PROTOCOL = "vibestudio.model-gateway.v1";

/**
 * Per-request controls. The context carries the system prompt, messages and
 * tool declarations; these are the knobs Pi models. `samplingParams` is Pi's
 * pass-through for OpenAI-compatible servers (for example
 * `{ tool_choice: "required" }`, which `toolChoice` does not model).
 */
export interface ModelGatewayTurnOptions {
  temperature?: number;
  maxTokens?: number;
  reasoning?: ThinkingLevel;
  toolChoice?: ToolChoice;
  samplingParams?: SamplingParams;
}

export interface ModelGatewayTurnInput {
  /** Caller-chosen, unique among this caller's in-flight turns. Names the turn for `cancel`. */
  turnId: string;
  /** A "provider:id" ref, or a model role such as "executor". */
  model: string;
  /** Pi context JSON: `systemPrompt`, `messages`, `tools`. */
  context: Context;
  options?: ModelGatewayTurnOptions;
}

/** Who a turn is attributed to, as recorded with the native model evidence. */
export interface ModelGatewayAttribution {
  /** The authenticated caller's runtime id. */
  callerId: string;
  callerKind: string;
  /** The owning agent when the caller is its eval; otherwise absent (panels and users attribute to themselves). */
  agentId?: string;
  /** The human on whose behalf the call runs, when the host attests one. */
  userId?: string;
}

export type ModelGatewayTurnResult =
  | {
      status: "completed";
      turnId: string;
      /** Full Pi assistant message: text, thinking and tool-call blocks, stop reason, usage. */
      message: AssistantMessage;
      /** The exact "provider:id" that ran the turn (the resolution of a role, if one was asked). */
      model: string;
      /** The requested role, when `model` was a role. */
      role?: string;
      usage: Usage;
      /** Who the turn was attributed to, as recorded with the native model evidence. */
      attribution: ModelGatewayAttribution;
    }
  | { status: "cancelled"; turnId: string };

export interface ModelGatewayCancelResult {
  /** False when the caller has no pending turn with this id (already settled or never admitted). */
  cancelled: boolean;
}

export interface ModelGatewayRpc {
  turn(input: ModelGatewayTurnInput): Promise<ModelGatewayTurnResult>;
  cancel(input: { turnId: string }): Promise<ModelGatewayCancelResult>;
}

export const modelGatewayRpcMethods = createReceiverRpcMethods<ModelGatewayRpc>([
  "turn",
  "cancel",
]);

const turnOptionsSchema = z
  .object({
    temperature: z.number().finite().optional(),
    maxTokens: z.number().int().positive().optional(),
    reasoning: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
    toolChoice: z.enum(["auto", "none"]).optional(),
    samplingParams: z.record(z.unknown()).optional(),
  })
  .strict();

export const modelGatewayTurnInputSchema = z
  .object({
    turnId: z.string().min(1).max(256),
    model: z.string().min(1),
    context: z
      .object({
        systemPrompt: z.string().optional(),
        messages: z.array(z.record(z.unknown())),
        tools: z.array(z.record(z.unknown())).optional(),
      })
      .passthrough(),
    options: turnOptionsSchema.optional(),
  })
  .strict();
