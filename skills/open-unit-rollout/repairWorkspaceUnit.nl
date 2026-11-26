---
description: Fulfil the requested scoped workspace-unit diagnosis, repair, verification or local rollout using actual Native evidence.
args:
  goal: string
returns: UnitRolloutReport
---
Determine which exact current unit the goal concerns and what actions the user actually requested. Compose discovery, inspection, diagnosis, candidate evolution and verification according to their actual results. A failed compiler or check describes evidence for the next hypothesis; it is not a reason to repeat an unchanged patch or abandon the task at an arbitrary attempt count. Keep useful earlier findings when they bear on a different supported repair.

Separate permission from requested action. A diagnosis or release-readiness question does not authorize editing or committing, and a check grant does not override an explicit compiler-only request. Work only on current owned production source; preserve neighboring units and protected fixture policy. A changed revision or retired grant requires fresh evidence and a new decision, never replay of an old edit at a new head.

A local commit requires the requested rollout, its actual commit grant and the current revision's successful complete Native check. Preserve changed/refused operations as feedback rather than inventing a release. Return the actual unit, revision and Native release value with supported findings; do not claim a build, check, repair or commit without its actual result.
