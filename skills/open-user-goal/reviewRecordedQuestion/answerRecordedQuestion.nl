---
description: Answer with stored intent, exact file cohort and limits on repeating prior work.
args:
  assignment: RecordedQuestion
  candidates: RecordedCandidate[]
  selection: RecordedSelection
  evidence: "RecordedEvidence | null"
returns: RecordedAnswer
---
1. A missing or ambiguous selection yields that disposition, null originalRationale and empty lists. This only concerns the visible local record.
2. Take originalRationale from the selected candidate and affected from the complete cohort's paths. Preserve that order. Use distinct withdrawn paths and distinct reasons in their recorded order.
3. Counteractions are already scoped to the selected proposal by the native collection API. Their counteractionRef identifies the counteraction, not the original proposal; different reference kinds are not a membership test. Report caution for an observed counteraction. Separate its actual scope from the original proposal and use the exact stored negative reason. An inferred operating constraint remains a suggestion, never an attributed recorded rule. Otherwise report supported for the complete matched record.
