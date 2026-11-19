---
description: Verify that an extension method belongs to the declared and active version.
args:
  evidence: ExtensionMethodEvidence
returns: UnitReview
---
1. Check whether evidence.method occurs in the declared method names. If not, return revision-needed and receiver-method-undeclared.
2. If status does not identify the given source, a running process and the candidate version together, return not-observed and live-method-unobserved.
3. On the exact running version a missing method is revision-needed and receiver-method-missing. A present method is ready and receiver-method-visible.
4. Cite the status id when present. Method visibility gives no grant or approval.
