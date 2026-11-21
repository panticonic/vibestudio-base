---
description: Select and prepare one scoped native starter and verify exact persisted draft files.
args:
  goal: string
returns: ScaffoldOutcome
budget: { maxTurns: 22 }
---
1. Call reviewScaffoldBrief with the original goal to get the exact current card and installed options. Pass the same inputs to planScaffoldDraft.
2. Only a prepare plan may call stageNativeScaffold with card.id, card.event and the exact chosen kinds in requested output order. Pass the actual receipt's draft identity or null to rereadScaffoldDraft.
3. Return actual card, options, plan, receipt and readback with scope "owned-scaffold-draft". Never build, install, or publish. Readback is evidence of the retained draft.
