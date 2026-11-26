import {buildIncidentHandoff} from "natlang:services";
import type {IncidentFocus, IncidentReceipt,IncidentDisposition} from "./types.js";
/** Retain the actual requested interpretation alongside its exact native checkpoint evidence. */
export default async function stageEvidence(checkpoints:string[],focus:IncidentFocus,analysis:IncidentDisposition):Promise<IncidentReceipt|null>{return buildIncidentHandoff.stage(checkpoints,focus,analysis);}
