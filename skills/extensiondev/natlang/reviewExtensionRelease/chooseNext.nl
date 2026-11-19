---
description: Choose the next development step from the independent source and runtime evidence.
args:
  source: ExtensionSourceReview
  runtime: ExtensionRuntimeReview
returns: ExtensionReleaseDecision
---
First check that source and runtime refer to the same operation, canonical name and source. A mismatch requires inspect-active-contract.
For missing-manifest, unpublished-candidate and undeclared-method return inspect-manifest, verify-and-publish-candidate and declare-method respectively.
For published-method use the runtime disposition: waiting-approval to wait-for-approval, building to wait-for-build, failed to inspect-failure, cold to await-activation, method-not-observed to inspect-active-contract, and live-method to observed-live. An earlier approved build does not deploy a local candidate.
