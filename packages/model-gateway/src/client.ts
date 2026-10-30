import {
  createDurableObjectServiceClient,
} from "@vibestudio/service-schemas/clients/durableObjectServiceClient";
import type { RpcCallerLike } from "@vibestudio/shared/workspaceServiceRpc";
import {
  MODEL_GATEWAY_SERVICE_PROTOCOL,
  modelGatewayRpcMethods,
  DECISION_UNSUPPORTED,
  type ModelGatewayCancelResult,
  type ModelGatewayScoreInput,
  type ModelGatewayScoreResult,
  type ModelGatewayTurnInput,
  type ModelGatewayTurnResult,
} from "./contract.js";

/** The turn was cancelled: by the caller's signal, by `cancel`, or by the gateway's retirement. */
export class ModelTurnCancelledError extends Error {
  constructor(readonly turnId: string) {
    super(`Model turn ${turnId} was cancelled`);
    this.name = "ModelTurnCancelledError";
  }
}

/** The model cannot score candidates; natlang's runtime falls back to its tool loop on this code. */
export class DecisionUnsupportedError extends Error {
  readonly code = DECISION_UNSUPPORTED;
  constructor(message: string) {
    super(message);
    this.name = "DecisionUnsupportedError";
  }
}

export interface ModelGatewayClient {
  /**
   * Run one model turn. Resolves with the completed turn; rejects with the
   * model's original failure, or with `ModelTurnCancelledError` when the turn
   * settled as cancelled. Aborting `signal` cancels the pending turn.
   */
  turn(
    input: ModelGatewayTurnInput,
    options?: { signal?: AbortSignal },
  ): Promise<Extract<ModelGatewayTurnResult, { status: "completed" }>>;
  /**
   * Score finite replies. Resolves with normalized probabilities; rejects with
   * `DecisionUnsupportedError` when the model's backend cannot score, and with
   * `ModelTurnCancelledError` when the turn was cancelled.
   */
  score(
    input: ModelGatewayScoreInput,
    options?: { signal?: AbortSignal },
  ): Promise<Extract<ModelGatewayScoreResult, { status: "completed" }>>;
  cancel(turnId: string): Promise<ModelGatewayCancelResult>;
}

/** Typed client over any RPC caller: panel, worker, or eval `rpc`. */
export function createModelGatewayClient(rpc: RpcCallerLike): ModelGatewayClient {
  const service = createDurableObjectServiceClient(
    rpc,
    MODEL_GATEWAY_SERVICE_PROTOCOL,
    modelGatewayRpcMethods,
  );
  return {
    async turn(input, options) {
      const signal = options?.signal;
      signal?.throwIfAborted();
      // The abort reaches the gateway as the inbound call's cancellation, which
      // cancels the pending turn there. `cancel` is the out-of-band route.
      const result = signal
        ? await service.callWithOptions("turn", [input], { signal })
        : await service.call("turn", input);
      if (result.status === "cancelled") throw new ModelTurnCancelledError(result.turnId);
      return result;
    },
    async score(input, options) {
      const signal = options?.signal;
      signal?.throwIfAborted();
      try {
        const result = signal
          ? await service.callWithOptions("score", [input], { signal })
          : await service.call("score", input);
        if (result.status === "cancelled") throw new ModelTurnCancelledError(result.turnId);
        return result;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith(DECISION_UNSUPPORTED))
          throw new DecisionUnsupportedError(error.message);
        throw error;
      }
    },
    cancel: (turnId) => service.call("cancel", { turnId }),
  };
}
