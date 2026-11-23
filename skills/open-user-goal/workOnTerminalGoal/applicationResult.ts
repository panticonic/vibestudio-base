import type {Screen,TerminalEvent,TerminalCheckReport,TerminalDiscovery,TerminalHandoff,TerminalSummary,TerminalResult} from "./types.js";
export default function applicationResult(initial:Screen,events:TerminalEvent[],checkReport:TerminalCheckReport|null,discovery:TerminalDiscovery|null,handoff:TerminalHandoff|null,summary:TerminalSummary):TerminalResult {
 const last=events.at(-1);return {terminal:last?("to" in last?last.to:null):initial,exit:last&&"exit" in last?last.exit:null,retired:last?.operation==="retire"&&last.absentFromRegistry,checkReport,discovery,handoff,summary};
}
