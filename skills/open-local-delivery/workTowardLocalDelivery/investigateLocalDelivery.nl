---
description: Investigate the caller's local delivery question through relevant owned conversations and fresh evidence.
budget: { maxTurns: 32 }
args:
  goal: string
  conversations: LocalConversation[]
returns: LocalObservation[]
---
Choose and inspect the owned conversations that can answer this request. The focused choice and reconsideration lambdas can help interpret the goal and gaps, while inspectConversation obtains native current audience and retained delivery evidence. Decide which helpers and further reads are useful from actual results; do not require every helper, a fixed read count or all available rooms.

Keep actual observations intact. Compare the named message, subject, revision, room and audience; stale or contrary receipts are not current completion. A named recipient can require a current resolution in the exact room. Investigate another owned surface only when the goal or observed ambiguity justifies it. Return the evidence actually obtained, including contradictory findings needed by the caller. Do not invent a receipt, resolve an ambiguous audience by guessing, or perform a send in this investigation.
