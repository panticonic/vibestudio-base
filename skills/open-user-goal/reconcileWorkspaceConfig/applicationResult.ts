import type {ConfigDisposition,ConfigOutcome,ConfigResult} from "./types.js";
export default function applicationResult(outcome:ConfigOutcome,handoff:ConfigDisposition|null):ConfigResult {return {outcome,handoff};}
