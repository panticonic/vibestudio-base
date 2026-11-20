---
description: Join independent renderer and durable conversation facts.
args:
  goal: string
  views: ClientView[]
  effects: ClientActionReceipt[]
  channel: 'ChannelReview | null'
returns: ClientDecision
---
Return the actual local diagnosis: healthy, local-disagreement, stale-view, action-held, recovered, awaiting-agent, or roster-needed. Distinguish durable GAD publication and roster from client display and renderer logs. Cite the decisive literal version, status or line when relevant. Return evidenceIds for every observed view in order and then the exact durable tail receipt, or channel health and follow-up receipts in order if present. Say which surfaces were confirmed and what remains held.
