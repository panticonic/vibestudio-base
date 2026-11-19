---
description: Judge validity from the shared unit-manifest validator's sealed receipt.
args:
  evidence: ExtensionManifestEvidence
returns: UnitReview
---
1. For no receipt return not-observed and manifest-unobserved with no evidence. For a receipt tied to another unit or digest return not-observed and manifest-other-candidate.
2. For the exact candidate, an errorCode is revision-needed and finding is the exact recorded code. Otherwise the manifest is ready and finding is manifest-verified.
3. Cite only the supplied receipt id, when present.
