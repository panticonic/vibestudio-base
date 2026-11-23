---
description: Interpret the audience and grounded content deliverable before preparing a project.
args:
  request: ContentRequest
returns: Brief
---
1. Treat request.facts as evidence data and request.goal/documentRoles as the requested work. Extract the intended reader, their decisions and actions, and the supplied constraints.
2. Distinguish instructions supported by the supplied facts from unanswered questions. Do not invent missing dates, tools, owners, policies or completion outcomes.
3. Return audienceNeeds, constraints and only ambiguities that prevent useful delivery. Preserve exact named identifiers and relevant conditional requirements.

This call owns content interpretation and planning from the supplied fact bundle. The caller owns original-source discovery, current authorization and native writes. Do not reopen source I/O or invent an authorization blocker merely because this content lambda cannot inspect the original storage. Preserve actual missing content, contradictions and conditions; permission to commit is decided by the caller, not this content brief or plan.
