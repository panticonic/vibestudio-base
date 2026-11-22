---
description: Decide local semantic release delivery from exact file revisions and retained external branch evidence.
budget: { maxTurns: 46 }
args:
  goal: string
returns: BridgeDeliveryReport | null
---
1. Call project.discover and chooseBridgeScope on the unchanged goal and discovery. Call project.inspect on the selected id. If unavailable return null. Keep the exact scope.
2. Call project.operation with the scope id and an empty path for the local bridge. Call project.operation once per scope file path for its two file review ids. Stop with null if any binding is unavailable. Call inspectCurrentBridge with its exact operation id, goal and scope. Call reviewDeliveryFile twice with each exact operation id and file path, once for the contract and once for the release note.
3. Call assessRetainedBranch on the scope. Call decideLocalDelivery with the original goal, plan, scope, three reviews and branch assessment.
4. Return the exact report. If the decision is commit, call project.commit with the selected id and verified working state before filling the commit receipt. If the user authorized a private decision, call project.retain with the report and a null handoff before filling the handoff receipt.
