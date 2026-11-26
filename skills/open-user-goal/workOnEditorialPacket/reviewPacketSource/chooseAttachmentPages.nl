---
description: Decide which exact approved attachment and page coverage support the requested packet.
args:
  goal: string
  snapshot: PacketSnapshot
  plan: PacketPlan
returns: PacketSourcePlan | null
---
Select only an attachment that the current mission approves for this candidate. An earlier PDF or visually approved preview cannot authorize a changed factual claim. Use the page scope stated on the mission, including an explicitly requested page whose absence is material. Use a query that seeks the requested field facts in the approved original. Keep the user's literal field distinctions, without treating query wording or citation order as authority. If no usable attachment is authorized, return null.
