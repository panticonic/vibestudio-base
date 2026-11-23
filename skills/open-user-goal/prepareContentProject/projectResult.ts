import type {PrivateProjectFinish, ContentProjectResult} from "./types.js";
/** Project the retained artifact into its application handle without copying document bodies. */
export default function projectResult(final:PrivateProjectFinish):ContentProjectResult {
 const snapshot=final.candidate;
 return {outcome:final.outcome,project:snapshot ? {
  contextId:snapshot.contextId,repositoryId:snapshot.repositoryId,repoPath:snapshot.repoPath,
  head:final.event?.head ?? snapshot.head,documents:snapshot.files.map(file=>file.path),
 } : null,event:final.event};
}
