import { contextId, vcs } from "@workspace/runtime";
import type { VcsEditChange } from "@vibestudio/service-schemas/vcs";

export interface ProjectPreparation {
  protocol: "project-preparation.v1";
  contextId: string;
  workingHead: Awaited<ReturnType<typeof vcs.edit>>["workingHead"];
  publication: "unchanged";
  liveRuntime: "unchanged";
}

export async function prepareChanges(
  changes: VcsEditChange[],
  summary: string,
  status: Awaited<ReturnType<typeof vcs.status>>,
): Promise<ProjectPreparation> {
  const result = await vcs.edit({
    contextId,
    expectedWorkingHead: status.workingHead,
    commandId: `workspace-dev:prepare:${contextId}:${crypto.randomUUID()}`,
    intentSummary: summary,
    changes,
  });
  return {
    protocol: "project-preparation.v1",
    contextId,
    workingHead: result.workingHead,
    publication: "unchanged",
    liveRuntime: "unchanged",
  };
}
