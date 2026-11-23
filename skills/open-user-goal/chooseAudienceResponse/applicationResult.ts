import type {AudienceAnswer,AudienceReceipt,AudienceResult} from "./types.js";
export default function applicationResult(answer:AudienceAnswer,receipt:AudienceReceipt|null):AudienceResult {return {answer,receipt};}
