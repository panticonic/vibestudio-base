import locatePhoneRehearsal from "./planPhoneFirstRun/locatePhoneRehearsal.nl";
import readPhoneEvidence from "./planPhoneFirstRun/readPhoneEvidence.nl";
import decidePhoneFirstRun from "./planPhoneFirstRun/decidePhoneFirstRun.nl";
import setUpPhone from "./planPhoneFirstRun/phoneSetup/setUpPhone.nl";
import type {PhoneFirstRunOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function planPhoneFirstRun(goal:string):Promise<PhoneFirstRunOutcome>{
 const card=await locatePhoneRehearsal(goal);
 const {assignment,startup,build}=await readPhoneEvidence(card.id);
 const resume=assignment.paired==="owned"&&assignment.setupRequest?await setUpPhone(assignment.setupRequest):null;
 return decidePhoneFirstRun(goal,{card,assignment,startup,build,resume});
}
