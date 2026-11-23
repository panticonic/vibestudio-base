import {clientDiagnostics} from "natlang:services";
import type {ClientDecision, ClientHandoff} from "../types.js";
/** Persist the requested next-step handoff only in this owned local case. */
export default async function stageClientHandoff(audience: string, decision: ClientDecision):Promise<ClientHandoff | null>{
 return clientDiagnostics.stage(audience, decision);
}
