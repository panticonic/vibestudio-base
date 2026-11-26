---
description: Answer the actual recorded-intent question from scoped native candidates and observed work/counteraction evidence.
args:
  goal: string
  assignment: RecordedQuestion
  candidates: RecordedCandidate[]
  selection: RecordedSelection
  evidence: "RecordedEvidence | null"
returns: RecordedQuestionFindings
---
Answer the user's actual question using the supplied local records, distinguishing stored intent, actual affected scope, later outcomes and present uncertainty. Include only facts supported by this scoped evidence. When the user asks for an exact affected set or count, preserve its completeness and identities. When the user asks what failed or was withdrawn, preserve the actual recorded limiting reason and distinguish a partial reversal from the original whole proposal. A recorded reason is different from an inferred future operating rule.

Missing or ambiguous evidence limits the conclusion; do not combine separate proposals or imply authorization outside this workspace. Counteractions are already scoped by the native query to the selected proposal. Their counteractionRef identifies each later counteraction, not the original proposal, so equality between those reference kinds is not a membership test. Return the requested supported answer, with uncertainty where evidence does not establish it, rather than an internal disposition label or a copied verification report.
