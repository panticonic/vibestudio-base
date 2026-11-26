---
description: Identify the visible local proposal to investigate, or state an actual identity gap.
args:
  assignment: RecordedQuestion
  candidates: RecordedCandidate[]
returns: RecordedSelection
---
Determine which visible local proposal the question concerns from its recorded intent, excerpt and distinguishing identity. Return that candidate's actual reference with blocker null when its identity is supported. Use missing when no relevant local proposal is identifiable, or ambiguous when several remain plausible without a distinguishing source. Do not select an unrelated record merely because it shares words.

This computation selects a handle for further investigation; it does not certify the final answer. Candidates do not yet contain the complete affected cohort or later counteraction evidence. Those facts are acquired using the selected handle, so their absence from an intent snippet is not evidence that the local proposal is missing. Likewise, absence of present-day approval does not erase a historical request or its purpose. A selected reference grants only its scoped reads, never permission to replay a past change or to claim an unobserved outcome.
