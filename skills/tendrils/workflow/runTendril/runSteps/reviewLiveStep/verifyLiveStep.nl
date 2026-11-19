---
description: Verify that the intended value reached both durable and rendered state on the same page.
args:
  step: TendrilStep
  before: TendrilPage
  after: TendrilPage
returns: TendrilFinding
---
Cite before.id then after.id. For every step require the same slot and build and a nondecreasing revision. A read succeeds with that evidence. For write use step.field, for invoke use step.expected. Also require the exact key and value in both after.stored and after.displayed. Return verified and the actual after page if the checks pass, or blocked and null if they fail.
