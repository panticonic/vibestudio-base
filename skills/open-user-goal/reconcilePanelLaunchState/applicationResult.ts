import type {LaunchNote,LaunchResult,LaunchSnapshot,LaunchVerdict} from "./types.js";
export default function applicationResult(readback:LaunchSnapshot,result:LaunchVerdict,handoff:LaunchNote|null):LaunchResult {return {readback,result,handoff};}
