import {quietIntegrationProtocol} from "natlang:services";
import type {QuietAudit} from "./types.js";
/** Read the secret-free observed audience, transport and quiet authority receipts. */
export default async function readQuietIntegrationAudit(operationId: string):Promise<QuietAudit | null>{
 return quietIntegrationProtocol.audit(operationId);
}
