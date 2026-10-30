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
 * tool declarations; these are the knobs Pi models. `toolChoice: "required"`
 * forces a tool call and is mapped to the model's own API word; a model whose
 * API cannot force one is refused. `reasoning` cannot be combined with
 * `"required"`. `samplingParams` is Pi's pass-through for provider sampling
 * parameters (for example `seed`).
 */
export interface ModelGatewayTurnOptions {
  temperature?: number;
  maxTokens?: number;
  reasoning?: ThinkingLevel;
  toolChoice?: ToolChoice | "required";
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

export interface ModelGatewayScoreInput {
  turnId: string;
  /** A "provider:id" ref, or a model role such as "executor". */
  model: string;
  /** Pi context JSON: `systemPrompt` and `messages`, without tools. */
  context: Context;
  /** The finite replies to score, each written as the closed final assistant message. */
  candidates: string[];
}

export type ModelGatewayScoreResult =
  | {
      status: "completed";
      turnId: string;
      model: string;
      role?: string;
      /** Summed token log-probability of each candidate after the prefix all candidates share. */
      logProbs: number[];
      /** Softmax of `logProbs`: normalized probabilities in candidate order. */
      probabilities: number[];
      /** Tokens each candidate spans after the shared prefix, when the backend reports them. */
      tokens?: number[];
      attribution: ModelGatewayAttribution;
    }
  | { status: "cancelled"; turnId: string };

/** Message prefix of the error a model that cannot score candidates fails with. */
export const DECISION_UNSUPPORTED = "decision-unsupported";

export interface ModelGatewayCancelResult {
  /** False when the caller has no pending turn with this id (already settled or never admitted). */
  cancelled: boolean;
}

export interface ModelGatewayRpc {
  turn(input: ModelGatewayTurnInput): Promise<ModelGatewayTurnResult>;
  /** Score finite replies with the model's own log-probabilities. Rejects with a `decision-unsupported` error for a model that cannot. */
  score(input: ModelGatewayScoreInput): Promise<ModelGatewayScoreResult>;
  cancel(input: { turnId: string }): Promise<ModelGatewayCancelResult>;
}

export const modelGatewayRpcMethods = createReceiverRpcMethods<ModelGatewayRpc>([
  "turn",
  "score",
  "cancel",
]);

const turnOptionsSchema = z
  .object({
    temperature: z.number().finite().optional(),
    maxTokens: z.number().int().positive().optional(),
    reasoning: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
    toolChoice: z.enum(["auto", "required", "none"]).optional(),
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

export const modelGatewayScoreInputSchema = z
  .object({
    turnId: z.string().min(1).max(256),
    model: z.string().min(1),
    context: z
      .object({
        systemPrompt: z.string().optional(),
        messages: z.array(z.record(z.unknown())),
      })
      .passthrough(),
    candidates: z.array(z.string()).min(1).max(256),
  })
  .strict();
