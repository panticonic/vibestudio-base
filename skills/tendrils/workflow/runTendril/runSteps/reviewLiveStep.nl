---
description: Perform a read, shared state update or exposed call and verify against the running Tendril.
args:
  previous: TendrilPage
  step: TendrilStep
returns: TendrilFinding
---
1. For read call tendrilPage.inspect. For write call tendrilPage.write with the exact field. For invoke first check that step.name occurs in previous.exposed, and return blocked citing previous.id if absent. Otherwise call tendrilPage.invoke with the name.
2. Call verifyLiveStep with step, previous and the new page and return its result.
