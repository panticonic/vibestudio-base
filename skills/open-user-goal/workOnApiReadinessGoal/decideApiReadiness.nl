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
Keep the exact profile, channel, current frontier and message. Provider access is unobserved. If selection is untrusted, choose hold with its precise reason. Otherwise use the actual required coverage status as the reason. If required coverage is incomplete, escalate read-only and identify only the necessary public audience, lifecycle or existing authorization. Respect the quiet boundary. With all required destinations ready, report the exact metadata or stage a local note only when mayStage is authorized. Include relevant optional gaps in the explanation. Do not open approval, refresh, exchange, send, fetch, or claim successful provider access.
