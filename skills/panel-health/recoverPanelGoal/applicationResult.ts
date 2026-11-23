import type {RecoveryReport,PanelRecoveryResult} from "../types.js";
export default function applicationResult(report:RecoveryReport):PanelRecoveryResult {if(report.status==="unresolved")return report;return {status:report.status,surfaceId:report.surfaceId,initial:report.initial,final:report.final,reason:report.reason};}
