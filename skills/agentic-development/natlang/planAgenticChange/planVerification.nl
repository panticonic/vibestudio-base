---
description: Plan focused tests, affected builds and a same-context canary.
args:
  goal: string
  impact: AgenticImpact
returns: "{ builds: AgenticBuildPlan; canary: AgenticCanaryPlan }"
---
Call planBuilds with the impact and then planCanary with the goal and that build plan. Return both results unchanged.
