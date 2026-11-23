---
description: Answer a local question about a recorded decision, its exact cohort and counteractions.
args:
  goal: string
returns: RecordedQuestionReport
budget: { maxTurns: 45 }
---
1. Call discoverRecordedQuestion(). Choose a short distinctive phrase from the user's question to search the owned durable record with findRecordedProposal.
2. Call selectRecordedProposal(assignment, candidates). For a selected record, call collectRecordedEvidence(assignment, selection.ref). Otherwise evidence is null.
3. Call answerRecordedQuestion(assignment, candidates, selection, evidence). Preserve exact recorded facts and uncertainty. Keep this a read-only local review.
Return the actual answer only. The working observations and authority checks stay in the call tree.
