---
description: Decide exact allowed local sharing scope from the distinct membership, invite and artifact facts.
args:
  assignment: ShareAssignment
  observation: ShareObservation
returns: ShareFinding
budget: { maxTurns: 14 }
---
1. Call checkScope with the assignment and observation. If it returns a hold decision, use it with the evidence basis.
2. Otherwise use the requested purpose and exact object role. An author note requires the live author and the author role. A reviewer note requires the reviewer role. A reader note can use the approved reader or reviewer role. Inspection requires an object role and can report current access without a note. Use hold-role if the role does not support the purpose.
3. Explain which evidence distinguishes access and the scope of the local note. Do not infer edit rights, membership changes, or external permission from the grant.
