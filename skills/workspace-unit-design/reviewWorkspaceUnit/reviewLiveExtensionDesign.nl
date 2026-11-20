---
description: Review both assigned extension manifests and determine whether the candidate manifest is published.
uses: [reviewWorkspaceUnit/reviewExtension, reviewWorkspaceUnit/combineWork]
args:
  request: LiveExtensionDesignRequest
returns: UnitReview
---
1. Call readExtensionDesign with the assigned operation ID.
2. Review the working manifest first, then the published one, by calling reviewExtension with each exact receipt.
3. Call reviewManifestPublication with the observation. Give combineWork the working, published and publication findings in that order. Return its exact result.
