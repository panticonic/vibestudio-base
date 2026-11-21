---
description: Ground an owned incident assessment or release restart in the local operational docket and its exact scope.
budget: { maxTurns: 20 }
args:
  goal: string
returns: OperationsGoalOutcome
---
1. Call selectOperationsDocket(goal). When there is no unique current docket, return a held disposition without an operation. For review-only authority, report why the operation was held using the docket's own rationale.
2. Use the selected evidence request and the original goal. For an incident call roles.incident(goal, request.signals). For a release call roles.release(goal, request.before, request.after). Keep the exact handoff and handles returned by the corresponding installed hierarchy.
3. Call ownedOperations.close after the assessment returns. Construct operation with its exact request kind, handoff, handles, and cleanup. For a release with a ready handoff and a current local retention authorization, call retainOperationsDossier with that docket and exact operation if the original goal asks to retain it. Otherwise the dossier is null.
4. Return the selected docket, exact dossier receipt or null, reviewed disposition, reason drawn from that assessment, and the exact operation. A blocked decision says what remains unresolved. The controlled rehearsal cannot execute a deployment or contact external recipients.
