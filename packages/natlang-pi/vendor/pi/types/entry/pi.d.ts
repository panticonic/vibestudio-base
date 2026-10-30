/**
 * What a host that runs natlang's model calls through its own model service needs, with no compiler or platform behind
 * it (staged for Vibestudio by scripts/stage-vibestudio.mjs as `pi`): natlang's request to Pi context translation, the
 * Pi reply as a model turn, and the request and response bodies of decision scoring.
 */
export * from '../model/pi-translation.js';
export * from '../model/decision-scoring.js';
export type { DecisionRequest, DecisionScores, ModelTurn, ModelTurnDelta, ModelTurnRequest } from '../contracts.js';
