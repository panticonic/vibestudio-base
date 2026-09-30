import { problemReportingConversation } from "@vibestudio/shared/problemReportingConversation";
/** Explicit-client reporting API. Agents prepare drafts and request sharing through targeted host approval. */
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

/** Begin an agent-led reporting conversation with explicitly selected context. */
export function startProblemReportConversation(
  rpc: Pick<RpcCaller, "call">,
  context?: { reportId: string; revision: number },
) {
  return rpc.call("main", "app.openShellSurface", [
    { kind: "command-agent", prompt: problemReportingConversation(context) },
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
  const reference = await reports.forConversation(draft.id, updated.revision);
  await startProblemReportConversation(rpc, reference);
  return reference;
}
