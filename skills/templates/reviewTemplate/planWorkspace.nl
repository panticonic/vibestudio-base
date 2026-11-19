---
description: Check source custody before authorizing a workspace creation plan.
uses: [reviewTemplate/reviewHost]
args:
  request: TemplateWorkspaceInput
returns: TemplateDecision
---
Call assessSource(request) for the immediate source requirement, then reviewHost(request.host) for compatibility. If assessSource returns an unfinished source requirement, return that requirement. Then return resolve-compatibility for any incompatible host or epoch handoff. Otherwise return ready-to-create. Use kind workspace and preserve request.pin as basis. A link or inspection is still a proposal.
