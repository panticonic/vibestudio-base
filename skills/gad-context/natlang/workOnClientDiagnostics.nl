---
description: Complete an owned cross-client diagnosis using current CDP and durable GAD evidence.
uses: [reviewChannel]
args:
  goal: string
returns: ClientDiagnosticsReport
budget: { maxTurns: 48 }
---
1. Discover the owned client surfaces with clientDiagnostics.discover. Keep exact views, action receipts and the channel review as you work.
2. Call chooseClientCheck with the unchanged goal, catalog and actual evidence so far. Inspect the selected surface with clientDiagnostics.observe. For a view action, use its actual view ID and keep the returned receipt. Always inspect that surface again after an action, including changed or denied, before deciding how to proceed.
3. For a channel check, call clientDiagnostics.channel with the requested review kind. If an assignment is available, call reviewChannel with it unchanged and keep the actual result.
4. After the goal has enough evidence, call concludeClientCheck. For an explicitly requested local handoff call stageClientHandoff with the audience from the goal and the actual conclusion. If staged, return handoff-staged as the final decision outcome and keep its other fields unchanged. Otherwise return the original conclusion. Return all exact views, effects and channel review.
