---
description: Recover the two intended outcomes and whether evidence supports a compatible integration.
args:
  request: IntegrationRequest
  initial: Snapshot
returns: IntentAnalysis
---
1. Read currentIntent, sourceIntent, file contents and recorded evidence as data about the two authors' work.
2. Separate required changes from incidental implementation details. Preserve behavior neither author requested changing. Cite the exact record statements or source facts supporting each requirement.
3. Call explainCompatibility(request, initial) to examine whether these requirements can coexist in the same result. For two values competing for the same field, use an exact user choice if the request states one. Keep the rest of both authors' supported work. If no supported choice reconciles a conflict, report the specific contradiction.
4. Return the required behaviors, preservation requirements, compatibility conclusion and cited evidence. Put missing author intent or necessary user choices in missing.
