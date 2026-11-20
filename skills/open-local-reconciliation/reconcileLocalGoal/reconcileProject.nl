---
description: Compare divergent intents, preserve concurrent work, and settle only the authorized owned project.
args:
  goal: string
  window: ReviewWindow
  prior: ArchiveSnapshot | null
returns: IntegrationResult
budget: { maxTurns: 30 }
---
1. Call observeProject for the actual common, local and incoming file contents and native coordinates. Infer which intentions the user wants, taking any qualifiers from the real window or the user-authorized prior record.
2. Ask planResolution to reconcile the evidence. Hold for ambiguous ownership, missing approval, closed windows, or requests for read-only analysis. Include a reason based on actual evidence and the current head. Never use invented coordinates.
3. Apply necessary source edits through writeResolution. Then re-observe and replan from the new head before merging with the currently offered decisions. When an authorized edit leaves the current and incoming files byte-identical and there is no remaining decision, call the merge with an empty decision list so the native integration can record convergence. When a newer revision is reported, observeProject again for the current window and files. Preserve the peer amendment and replan only while the user's authorization still holds.
4. After real merge acceptance observe again. Mark integrated only after no remaining coordinates and after the resulting files establish the user's intentions. Return the exact observed final head and reason.
