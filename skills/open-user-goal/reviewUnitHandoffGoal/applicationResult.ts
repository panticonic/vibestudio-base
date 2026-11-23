import type {UnitHandoffReport,UnitHandoffResult} from "./types.js";
export default function applicationResult(report:UnitHandoffReport):UnitHandoffResult {return {decision:report.decision,path:report.plan.path,design:report.design,identity:report.identity,reason:report.reason};}
