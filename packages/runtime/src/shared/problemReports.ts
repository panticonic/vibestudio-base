/** Explicit-client reporting API. Draft preparation is available to agents; sharing is trusted human chrome. */
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { reportDraftContent } from "@vibestudio/service-schemas/problemReportBundle";
export { reportDraftContent } from "@vibestudio/service-schemas/problemReportBundle";
import { problemReportsMethods } from "@vibestudio/service-schemas/problemReports";
import type { RpcCaller } from "@vibestudio/rpc";
export function createProblemReportsClient(rpc: Pick<RpcCaller, "call">) {
  return createTypedServiceClient(
    "problemReports",
    problemReportsMethods,
    (service, method, args) => rpc.call("main", `${service}.${method}`, args),
  );
}
export type { ProblemReportBundle } from "@vibestudio/service-schemas/problemReportBundle";
export {
  REPORT_POLICY,
  REPORT_MEDIA_TYPE,
} from "@vibestudio/service-schemas/problemReportBundle";

/** Open the same trusted composer. A selected server-prepared revision is copied as a new local review snapshot. */
export function openProblemReport(
  rpc: Pick<RpcCaller, "call">,
  prepared?: { reportId: string; revision: number; digest: string },
) {
  return rpc.call("main", "app.openShellSurface", [
    { kind: "problem-report", ...(prepared ? { prepared } : {}) },
  ]);
}

/** A user-selected source becomes one bounded, reviewable draft; this never enables or sends reporting. */
export async function reportSelectedProblem(
  rpc: Pick<RpcCaller, "call">,
  selection: {
    problem: import("@vibestudio/service-schemas/problemReportBundle").ProblemReportBundle["problem"];
    source: import("@vibestudio/service-schemas/problemReportBundle").ProblemReportBundle["evidence"][number]["source"];
    coordinate: string;
    value: unknown;
    reference?: {
      kind: "panel" | "message" | "invocation" | "build";
      coordinate: string;
    };
  },
) {
  const reports = createProblemReportsClient(rpc);
  const draft = await reports.create(selection.problem);
  const raw = JSON.stringify(selection.value);
  const complete = new TextEncoder().encode(raw).byteLength <= 64 * 1024;
  const value = {
    ...draft.value,
    evidence: [
      {
        id: crypto.randomUUID(),
        source: selection.source,
        coordinate: selection.coordinate,
        capturedAt: new Date().toISOString(),
        completeness: complete ? ("complete" as const) : ("truncated" as const),
        reason: complete ? null : ("byte-budget" as const),
        retained: complete ? 1 : 0,
        omitted: complete ? 0 : 1,
        redactions: [],
        value: complete ? raw : "null",
      },
    ],
    references: selection.reference
      ? [{ id: crypto.randomUUID(), ...selection.reference }]
      : [],
  };
  const updated = await reports.update(
    draft.id,
    draft.revision,
    reportDraftContent(value),
  );
  let revision = updated.revision;
  let prepared;
  try {
    prepared = await reports.prepare(draft.id, revision);
  } catch (error) {
    const current = await reports.get(draft.id);
    if (current.revision === revision) throw error;
    revision = current.revision;
    prepared = await reports.prepare(draft.id, revision);
  }
  await openProblemReport(rpc, {
    reportId: draft.id,
    revision,
    digest: prepared.digest,
  });
  return { reportId: draft.id, revision };
}
