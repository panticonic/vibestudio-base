export * from "./realm/types.js";

import type {RegencyForecast,RegencyFinding,RegencyDecision,RegencyAdvance,RegencyNote,RegencyPlan} from "./realm/types.js";

export type RegencyResult = {forecasts:RegencyForecast[];findings:RegencyFinding[];decision:RegencyDecision;advance:RegencyAdvance|null;note:RegencyNote|null};

export type RegencyInvestigation = {plan:RegencyPlan;forecasts:RegencyForecast[];findings:RegencyFinding[]};
