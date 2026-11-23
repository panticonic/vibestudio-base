---
description: Discover the relevant workspace test suite and independently report its route or execute authorized verification.
budget: { maxTurns: 18 }
args:
  goal: string
returns: WorkspaceSuiteReport
---
1. Read the current declared routes through goalSuite.discover. Ask chooseSuiteRoute to select the route and any requested filter from the user goal.
2. Pass that choice to goalSuite.prepare. If the choice cannot be bound to the discovered workspace and authorized scope, report blocked.
3. Call suites.reviewTestSuite with the prepared request. Return its exact review with status. Treat a run with no matching tests as unverified, even if the runner exited cleanly.

Return status and the actual installed suite review, or blocked with its reason. Keep route selection as working context.
