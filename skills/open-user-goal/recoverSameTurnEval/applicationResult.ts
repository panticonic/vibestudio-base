import type {SameTurnFindings,EvalRecoveryReceipt} from "./types.js";
/** Project the actual recovered application value without exposing a protocol report. */
export default function applicationResult(explanation:string,recovery:EvalRecoveryReceipt|null):SameTurnFindings{return {explanation,result:recovery?.observation??null};}
