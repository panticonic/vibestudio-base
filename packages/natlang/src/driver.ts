import type { Context } from "@panticonic/pi-ai";
import type { ModelGatewayClient } from "@workspace/model-gateway/client";
import type { ModelGatewayTurnOptions } from "@workspace/model-gateway/contract";
import { LOCAL_PROVIDER_ID, type ModelCatalogEntry } from "@workspace/model-catalog/catalog";
import {
  framedDecision,
  piAssistantToTurn,
  toPiContext,
  type DecisionRequest,
  type DecisionScores,
  type ModelTurnRequest,
} from "@workspace/natlang-pi";
import type { ModelDriver } from "../vendor/workerd/natlang-workerd.js";

/** The reply form natlang scores for a local (stock) model; part of the executor's identity (models.ts). */
export const LOCAL_DECISION_REPLY = "result-object" as const;

/** What the driver needs of the model settings service. */
export interface ModelResolver {
  /** The catalog entry a model role or "provider:id" ref names right now, or the reason none is usable. */
  resolve(model: string): Promise<ModelCatalogEntry>;
}

/**
 * A natlang `ModelDriver` over the model gateway. Natlang's request becomes a Pi
 * context through natlang's own translation, the gateway runs the turn as a
 * native model task (credentials are injected at host egress; this code never
 * sees them), and the completed Pi message becomes the turn natlang reads.
 *
 * `model` is a model role (`executor`) or a "provider:id" ref; the resolver turns
 * it into the catalog entry whose API the request is rendered for, and the turn
 * runs on exactly that ref. The driver carries `decide`, the decision readout: a finite set of replies is scored by the
 * model's own log-probabilities through the gateway (`score`), and a model that cannot score fails with the gateway's
 * `decision-unsupported`, which natlang's runtime answers with the ordinary tool loop. Aborting `signal` cancels the pending gateway turn:
 * the abort reaches the gateway as the inbound call's cancellation.
 */
export function gatewayDriver(options: {
  gateway: ModelGatewayClient;
  resolver: ModelResolver;
  model: string;
  /** Prefix of this driver's turn ids; unique among the caller's in-flight turns. */
  turnPrefix: string;
}): ModelDriver {
  const { gateway, resolver, model, turnPrefix } = options;
  let turns = 0;
  const nextTurnId = () => `${turnPrefix}:${(turns += 1)}`;
  const turn = async (request: ModelTurnRequest, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const entry = await resolver.resolve(model);
    const api = entry.modelSpec.api;
    const context = toPiContext(request, { api, provider: entry.provider, id: entry.id });
    const result = await gateway.turn(
      {
        turnId: nextTurnId(),
        model: entry.ref,
        context: context as unknown as Context,
        options: turnOptions(request, entry),
      },
      signal ? { signal } : undefined
    );
    const modelTurn = piAssistantToTurn(result.message, entry.provider);
    return {
      ...modelTurn,
      raw_response: {
        ...modelTurn.raw_response,
        vibestudio: {
          model: result.model,
          ...(result.role ? { role: result.role } : {}),
          attribution: result.attribution,
        },
      },
    };
  };
  const decide = async (readout: DecisionRequest, signal?: AbortSignal): Promise<DecisionScores> => {
    signal?.throwIfAborted();
    const entry = await resolver.resolve(model);
    // A local model is a stock instruction model, not one natlang trained on the bare-value reply the readout asks for:
    // it is asked for, and scored on, the form it answers in (the same one natlang's own managed stock models use).
    const request = framedDecision(readout, entry.provider === LOCAL_PROVIDER_ID ? LOCAL_DECISION_REPLY : undefined);
    const { messages } = toPiContext(
      { messages: request.messages, tools: [], seed: null, max_tokens: null },
      { api: entry.modelSpec.api, provider: entry.provider, id: entry.id }
    );
    // The gateway takes the system prompt beside the messages, as Pi's context does.
    const system = messages.filter((message) => message.role === "system");
    const scored = await gateway.score(
      {
        turnId: nextTurnId(),
        model: entry.ref,
        context: {
          ...(system.length > 0
            ? { systemPrompt: system.map((message) => message.content).join("\n\n") }
            : {}),
          messages: messages.filter((message) => message.role !== "system"),
        } as unknown as Context,
        candidates: request.options,
      },
      signal ? { signal } : undefined
    );
    return {
      log_probs: scored.logProbs,
      ...(scored.tokens ? { tokens: scored.tokens } : {}),
      ...(scored.promptTokens !== undefined ? { prompt_tokens: scored.promptTokens } : {}),
    };
  };
  return Object.assign(turn, { decide });
}

/**
 * The gateway's per-request knobs for one natlang turn. A turn that must call a
 * tool asks the gateway for `toolChoice: "required"`, which it maps to the
 * model's own API word (and refuses for an API that cannot force one).
 */
function turnOptions(request: ModelTurnRequest, entry: ModelCatalogEntry): ModelGatewayTurnOptions {
  // Natlang's llama.cpp fork reads two more request fields natlang sets per turn: guided generation of tool calls
  // and the call's seed. The model's own serving settings (temperature, template arguments) come with the model.
  const forkFields = {
    ...(request.guidance ? { guidance: request.guidance } : {}),
    ...(request.seed !== null && request.seed !== undefined ? { seed: request.seed } : {}),
  };
  return {
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.max_tokens ? { maxTokens: request.max_tokens } : {}),
    ...(request.tool_choice === "required" ? { toolChoice: "required" as const } : {}),
    ...(entry.provider === LOCAL_PROVIDER_ID && Object.keys(forkFields).length > 0
      ? { samplingParams: forkFields }
      : {}),
  };
}
