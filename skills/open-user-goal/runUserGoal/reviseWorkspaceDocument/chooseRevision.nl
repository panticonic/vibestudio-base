---
description: Select the target, distinguish authoritative evidence from drafts, and produce a minimal text revision.
args:
  goal: string
  documents: WorkspaceRevision[]
  research: 'ResearchGoalReport | null'
returns: '{ path: string; version: string; text: string } | null'
---
Call policy.chooseRevision with goal, documents, research. Return its exact result.
