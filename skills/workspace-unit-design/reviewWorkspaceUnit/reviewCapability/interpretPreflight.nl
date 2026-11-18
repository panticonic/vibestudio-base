---
description: Advise from the actual host preflight decision, without invoking an operation.
args:
  evidence: { preflight: PreflightEvidence | null; method: string }
returns: UnitReview
---
1. No preflight receipt means not-observed with finding preflight-unobserved and no evidence.
2. The host denied decision means revision-needed and operation-denied. Acquirable means waiting and acquisition-required. Allowed means ready and preflight-allowed.
3. Cite the preflight id. Preflight is inspection, including when it says allowed; it neither consumes a fresh decision nor executes the method.
