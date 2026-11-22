---
description: Discover the relevant workspace test suite and independently report its route or execute authorized verification.
budget: { maxTurns: 18 }
args:
  goal: string
returns: WorkspaceSuiteReport
---
1. Read the current declared routes through goalSuite.discover. Ask chooseSuiteRoute to select the route and any requested filter from the user goal.
2. Pass that choice to goalSuite.prepare. If the choice cannot be bound to the discovered workspace and authorized scope, report blocked.
3. Call suites.reviewTestSuite with the prepared request. Return the actual choice and its exact review. Treat a run with no matching tests as unverified, even if the runner exited cleanly.
