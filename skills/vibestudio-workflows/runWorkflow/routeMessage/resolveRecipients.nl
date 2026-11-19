---
description: Assess the recipient named by the caller using the supplied actual roster and canonical resolver outcome.
args:
  request: MessagingRequest
  snapshot: Snapshot
returns: Decision
---
1. Read the supplied roster's actual refs, kinds and notes. Identify the phrase that names the recipient, separately from message facts and body names.
2. If snapshot.resolution.kind is ref, return deliver with that exact supplied ref and explain its evidence. Do not invent a recipient or expand the audience.
3. If the canonical resolver reports ambiguity or absence, return hold with ref null and explain which distinction or missing addressee prevents delivery. You have no live messaging services and cannot override the exact resolver.
