---
description: Verify integration from the actual semantic state rather than the proposed changes.
args:
  request: IntegrationRequest
  initial: Snapshot
  analysis: IntentAnalysis
  result: Snapshot
returns: Verification
uses: [evidence/checkSupport]
---
1. Compare actual result.files and result.evidence with initial and both required intention lists.
2. Check preservation requirements, complete source integration evidence, and remaining coordinates. A new head or a completed tool call alone does not establish the requested outcome.
3. Call checkSupport with both required intention lists and the preservation requirements, using observations grounded in result.files and result.evidence. Return passed only when every required behavior is supported and no coordinate remains unresolved. Quote actual result evidence. List unsupported or contradictory requirements in missing.
