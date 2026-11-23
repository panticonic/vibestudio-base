import {contentProjectDraft} from "natlang:services";
import type {ProjectScopeLease, PreparedContentSnapshot} from "../types.js";

/** Preparation creates a private working state. Its returned head is the write basis. */
export default async function writeInitialProject(
  scope: ProjectScopeLease,
  documents: {path:string;text:string}[],
): Promise<PreparedContentSnapshot | null> {
  const prepared = await contentProjectDraft.prepare(scope.receipt, scope.initialHead);
  return prepared === null ? null : contentProjectDraft.write(scope.receipt, prepared.head, documents);
}
