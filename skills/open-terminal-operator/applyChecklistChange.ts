import {openTerminalInput} from "natlang:services";
import type {TerminalStart,ChecklistChange,TerminalEvent} from "./types.js";
export default async function applyChecklistChange(request:ChecklistChange):Promise<TerminalEvent|null>{return openTerminalInput.change(request);}
