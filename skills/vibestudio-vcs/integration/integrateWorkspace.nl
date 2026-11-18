---
description: Integrate the caller-assigned workspace source while preserving both supported intentions.
args:
  request: Request
returns: Report
---
1. Read initial from workspaceIntegration.observe. Call compareIntents(request, initial). Keep its required current and source behavior, preservation requirements, and evidence. If intent is unsupported or incompatible, report the specific blocker without editing. If no coordinates remain, call verifyIntegration on the observed state before choosing whether the goal is already complete; perform no redundant mutation.
2. Call planResolution(request, initial, analysis). Require a justified explicit decision for each coordinate it addresses and exact before/after edits against initial.files. If the plan has a blocker, report it and the current head.
3. If edits are nonempty, apply them at initial.head and keep the returned head; otherwise retain initial.head. After edits, observe the new comparison and call planResolution again against that actual state before merging: offered resolutions can change when the current content changes. Merge only the explicit decisions offered at the new head. Source and context were assigned by the caller; copy observed coordinate identities unchanged.
4. Observe the actual result and call verifyIntegration(request, initial, analysis, result). Return integrated only if the result has no remaining coordinates and verification establishes every supported intention and preservation requirement.
5. If an operation refuses a stale basis or a partial operation leaves a new head, observe that actual state. Diagnose the new evidence before any new plan; do not repeat an identical rejected operation. Retain earlier outcomes. Return blocked if evidence supplies no justified remaining action. Never publish or claim atomic rollback across separate edit and merge operations.
