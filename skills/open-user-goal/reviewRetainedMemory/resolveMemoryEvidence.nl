---
description: Resolve bounded leads using the exact owned original conversation and immutable native file states.
budget: { maxTurns: 24 }
args:
  brief: MemoryBrief
  plan: MemoryPlan
returns: MemoryEvidence
---
1. Call evidence.recallMemoryLeads once with the exact selected query and kinds. Retain the returned leads.
2. If plan.readTranscript call evidence.readMemoryMessages with brief.channelId; preserve the original message fields. Otherwise messages is empty.
3. For each unique file or commit event in leads, read evidence.readMemoryArchive with its actual eventId. Keep successful files in lead order, once per event.
4. Call evidence.readMemoryDraft only if the plan asks. Otherwise working is null. Return the exact facts.
