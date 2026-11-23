import checkSupport from "./verifyClaimSupport/evidenceRules/checkSupport.nl";
import type {ClaimPacket,ClaimEvidence,ClaimSupport} from "./types.js";
export default async function verifyClaimSupport(packet:ClaimPacket,evidence:ClaimEvidence):Promise<ClaimSupport>{return checkSupport(packet.requirements.map(requirement=>requirement.text),evidence.observations);}
