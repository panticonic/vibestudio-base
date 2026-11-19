---
description: Hand the isolated candidate to the next workspace review step.
args:
  candidate: CandidateReview
returns: "already-published" | "resolve-conflicts" | "validate-candidate"
---
If Vibestudio records published, return already-published. If conflicts remain, return resolve-conflicts. Otherwise return validate-candidate because a conflict-free candidate still needs semantic review and tests.
