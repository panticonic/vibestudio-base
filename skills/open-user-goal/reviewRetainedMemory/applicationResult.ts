import type {MemoryNote,MemoryOutcome,MemoryResult} from "./types.js";
export default function applicationResult(outcome:MemoryOutcome,handoff:MemoryNote|null):MemoryResult {return {outcome,handoff};}
