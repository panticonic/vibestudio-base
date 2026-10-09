import { contextId, vcs } from "@workspace/runtime";
import type { VcsEditChange, VcsEditInput, VcsWorkingMutationResult } from "@vibestudio/service-schemas/vcs";

/** Caller-owned identity and observed basis of one semantic edit. */
export type PreparationCommand = Pick<VcsEditInput, "commandId" | "expectedWorkingHead">;

export interface ProjectPreparation extends VcsWorkingMutationResult {
  protocol: "project-preparation.v1";
  /** Retain this exact request for ordinary VCS transport recovery. */
  command: VcsEditInput;
  publication: "unchanged";
  liveRuntime: "unchanged";
}

export async function prepareChanges(
  changes: VcsEditChange[],
  summary: string,
  status: Pick<Awaited<ReturnType<typeof vcs.status>>, "workingHead">,
  commandId = `workspace-dev:prepare:${contextId}:${crypto.randomUUID()}`,
): Promise<ProjectPreparation> {
  const command: VcsEditInput = {
    contextId,
    expectedWorkingHead: status.workingHead,
    commandId,
    intentSummary: summary,
    changes,
  };
  const result = await vcs.edit(command);
  return {
    ...result,
    protocol: "project-preparation.v1",
    contextId,
    command,
    publication: "unchanged",
    liveRuntime: "unchanged",
  };
}
