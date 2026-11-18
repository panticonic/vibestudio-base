---
description: Interpret the audience and grounded content deliverable before preparing a project.
args:
  request: Request
returns: Brief
---
1. Treat request.facts as evidence data and request.goal/documentRoles as the requested work. Extract the intended reader, their decisions and actions, and the supplied constraints.
2. Distinguish instructions supported by the supplied facts from unanswered questions. Do not invent missing dates, tools, owners, policies or completion outcomes.
3. Return audienceNeeds, constraints and only ambiguities that prevent useful delivery. Preserve exact named identifiers and relevant conditional requirements.
