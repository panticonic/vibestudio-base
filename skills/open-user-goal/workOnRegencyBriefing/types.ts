export * from "./realm/types.js";

import type {RegencyReport} from "./realm/types.js";

export type RegencyResult = {forecasts:RegencyReport["forecasts"];findings:RegencyReport["findings"];decision:RegencyReport["decision"];advance:RegencyReport["advance"];note:RegencyReport["note"]};
