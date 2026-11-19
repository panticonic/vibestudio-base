---
description: Read back the prepared review and determine the next candidate review step.
args:
  request: CandidateRequest
  receipt: StageReceipt
returns: { status: ReportStatus; candidate: CandidateReview | null }
uses: [candidateIdentity]
---
1. Call readCandidate. Pass request, receipt and observed to candidateIdentity.verify.
2. If the identity status is unconfirmed or stale-base, return that status with a null candidate. An existing operation after an unacknowledged preparation can represent partial staging.
3. Pass the verified candidate to chooseReview and return its status with that exact candidate.
