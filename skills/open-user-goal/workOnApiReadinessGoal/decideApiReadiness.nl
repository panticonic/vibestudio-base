---
description: Decide whether current credential metadata supports a read-only or local handoff.
args:
  goal: string
  index: IntegrationIndex
  choice: SelectionChoice
  current: SelectionFrontier
  selection: SelectionWitness
  review: "{ request: QuietRequest; result: BoundReport } | null"
  audit: QuietAudit | null
returns: IntegrationReadinessPlan
---
Keep the exact profile, channel, current frontier and message. Provider access is unobserved. If selection is untrusted, choose hold with its precise reason. Otherwise use the actual required coverage status as the reason. If required coverage is incomplete, escalate read-only and identify only the necessary public audience, lifecycle or existing authorization. Respect the quiet boundary. Interpret the actual goal to decide whether a local note was requested and whether its stated condition is supported. mayStage is only native permission, not a request to write. With required destinations ready, explain the actual metadata and stage only a requested, permitted finding. Include relevant optional gaps in the explanation. Do not open approval, refresh, exchange, send, fetch, or claim successful provider access.
