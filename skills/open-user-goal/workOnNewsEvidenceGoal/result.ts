import type {NewsEvidenceReport,NewsEvidenceResult} from "../reviewNewsEvidence/workspace/types.js";
export default function result(report:NewsEvidenceReport):NewsEvidenceResult {
 return {topic:report.plan.topic,action:report.plan.action,explanation:report.plan.explanation,
  readers:report.readers.map(reader=>reader.result),schedule:report.schedule.result,
  briefing:report.briefing?.result ?? null,sources:report.sources.map(({articleId,url,digest})=>({articleId,url,digest})),handoff:report.handoff};
}
