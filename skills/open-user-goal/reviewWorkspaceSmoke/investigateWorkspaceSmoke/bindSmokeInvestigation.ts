import type {SmokeSource,SmokeSelection,SmokeRuntime,SmokeInvestigation} from "../types.js";
/** Join actual native values without asking a model to transcribe their digests. */
export default function bindSmokeInvestigation(source:SmokeSource,selection:SmokeSelection,runtime:SmokeRuntime|null,finding:string):SmokeInvestigation{return{source,selection,runtime,finding};}
