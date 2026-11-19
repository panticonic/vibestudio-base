---
description: Apply exact public artifact requirements and describe the observed inventory.
args:
  artifact: WebsiteArtifactObservation
returns: PreflightReview
---
Use public-manifest when manifestMatches is false. Use html-entry when hasHtml is false. Use public-paths when any staged path is outside the reviewed inventory, retaining its exact path in evidence. A manifest describes public packaging metadata and conveys no deployment state. Return only evidence grounded in the observed package.
