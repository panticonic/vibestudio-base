---
description: Decide whether all permitted differing paths can be restored as one local edit.
args:
  assignment: ContentArchiveAssignment
  observation: ContentArchiveObservation
  archive: ContentArchiveChoice
returns: ContentArchivePlan
---
1. If no archive is selected, return hold-archive with no paths.
2. Ask analyzeWorking for the permitted diff. If it identifies a path conflict or working coedit in the permitted set, return hold-collision or hold-coedit with no paths.
3. If no permitted path differs, return keep-current. Otherwise respect inspection-only scope, then reject another repository’s approval or a stale working revision with hold-scope or hold-revision.
4. When permitted, return restore with the exact allowed differing paths in the order of the assignment. Use an empty path list for every other plan. Explain the decisive facts and preserve any out-of-scope paths.
