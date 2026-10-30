import type { Context } from "@panticonic/pi-ai";
import type { ModelGatewayClient } from "@workspace/model-gateway/client";
import type { ModelGatewayTurnOptions } from "@workspace/model-gateway/contract";
import type { ModelCatalogEntry } from "@workspace/model-catalog/catalog";
import {
  piAssistantToTurn,
  toPiContext,
  type ModelDriver,
  type ModelTurnRequest,
} from "../vendor/workerd/natlang-workerd.js";

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
 * runs on exactly that ref. Aborting `signal` cancels the pending gateway turn:
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
  return async (request: ModelTurnRequest, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const entry = await resolver.resolve(model);
    const api = entry.modelSpec.api;
    const context = toPiContext(request, { api, provider: entry.provider, id: entry.id });
    const result = await gateway.turn(
      {
        turnId: `${turnPrefix}:${(turns += 1)}`,
        model: entry.ref,
        context: context as unknown as Context,
        options: turnOptions(request),
      },
      signal ? { signal } : undefined
    );
    const turn = piAssistantToTurn(result.message, entry.provider);
    return {
      ...turn,
      raw_response: {
        ...turn.raw_response,
        vibestudio: {
          model: result.model,
          ...(result.role ? { role: result.role } : {}),
          attribution: result.attribution,
        },
      },
    };
  };
}

/**
 * The gateway's per-request knobs for one natlang turn. A turn that must call a
 * tool asks the gateway for `toolChoice: "required"`, which it maps to the
 * model's own API word (and refuses for an API that cannot force one).
 */
function turnOptions(request: ModelTurnRequest): ModelGatewayTurnOptions {
  return {
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.max_tokens ? { maxTokens: request.max_tokens } : {}),
    ...(request.tool_choice === "required" ? { toolChoice: "required" as const } : {}),
  };
}
