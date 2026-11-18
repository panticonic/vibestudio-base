---
description: Propose exact content and explicit coordinate resolutions that preserve both supported intentions.
args:
  request: IntegrationRequest
  initial: Snapshot
  analysis: IntentAnalysis
returns: Plan
---
1. If analysis is incompatible or lacks necessary intent, return no edits or decisions and a specific blocker.
2. For each remaining coordinate, choose a resolution justified by both intended outcomes and current file facts. Use composed when integration combines changes; use current only when actual current content already meets the requirements. Explain every discarded source effect.
3. Propose the smallest exact before/after edits needed. before must be the complete observed file text. Preserve unrelated fields and behavior. Use only observed paths and coordinate identities.
4. Check the proposed result against each required and preserved behavior. Return edits, explicit decisions, rationale and any unresolved blocker. This is a proposal; verification later reads actual persisted state.
