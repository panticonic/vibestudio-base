---
description: Decide whether the plan still belongs to the same automation and run state.
args:
  plan: AutomationReport
  before: AutomationPlanningSnapshot
  after: AutomationPlanningSnapshot
returns: "ready" | "held" | "changed"
---
Call checkSnapshot with the plan and both snapshots. Return held if it reports unsupported, changed if it reports different, and ready if it reports matching. Even an otherwise plausible plan must be redone when its underlying observation changes.
