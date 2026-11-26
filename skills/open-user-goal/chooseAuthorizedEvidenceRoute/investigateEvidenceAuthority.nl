---
description: Produce actual scoped route-authority evidence for the outer coordinator.
args:
  goal: string
returns: RouteInquiry
uses: [chooseAuthorizedEvidenceRoute/workspace/discoverEvidenceRoutes, chooseAuthorizedEvidenceRoute/inspectExactRouteAuthority, chooseAuthorizedEvidenceRoute/selectEvidenceRoute]
---
Determine the relevant evidence origins and permissions from the actual offer and user question. Use the installed authority codebase for canonical requested scopes and real preflights, then interpret which route, if any, can safely answer this request. Eligibility and a required approval are facts to preserve, not permission to execute.

Return the actual offer, authority report and semantic choice for the outer coordinator. This inquiry does not execute a selected evidence read or retain a private note.
