---
description: Separate one channel's durable integrity findings from ordinary activity.
args:
  operationId: string
returns: ChannelHealthReview
budget: { maxTurns: 24 }
---
Read the assigned current health evidence. Call classifyFinding for each finding and keep its judgment with the same kind. Status is urgent for any urgent finding. Otherwise status is investigate if integrity is broken or a finding needs investigation, busy for in-flight activity, and healthy otherwise. Return the exact evidence, status, and judgments in evidence order.
