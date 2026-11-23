import {openTerminalRead} from "natlang:services";
import type {TerminalStart,ChecklistChange,TerminalEvent} from "./types.js";
export default async function openTerminal():Promise<TerminalStart>{return openTerminalRead.open();}
