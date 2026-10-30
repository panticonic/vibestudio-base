/** The fixed sequence of the report: one snapshot, list the findings, apply the policy, assemble. No step needs a model. */
import { gad } from "natlang:services";
import findings from "./findings.js";
import { nextInspector, urgencyOf } from "./policy.js";
import type { ChannelRef, HealthReport, JudgedFinding } from "../types.js";

export default async function collect(ref: ChannelRef): Promise<HealthReport> {
  const health = await gad.inspectAgentHealth({ channelId: ref.channelId, branchId: ref.branchId });
  const listed = findings(health);
  const judged: JudgedFinding[] = listed.map((finding) => {
    const target = nextInspector(finding.kind);
    return { ...finding, urgency: urgencyOf(finding.kind), ...(target ? { next: target } : {}) };
  });
  const integrity = health.summary.durableIntegrityOk ? "ok" : "broken";
  const status = judged.some((f) => f.urgency === "urgent")
    ? "urgent"
    : judged.some((f) => f.urgency === "investigate") || integrity === "broken"
      ? "investigate"
      : health.summary.activity === "in-flight"
        ? "busy"
        : "healthy";
  return {
    channelId: health.channelId,
    branchId: health.branchId,
    generatedAt: health.generatedAt,
    integrity,
    activity: health.summary.activity,
    status,
    findings: judged,
  };
}
