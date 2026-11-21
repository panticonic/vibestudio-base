---
description: Decide which exact approved attachment and page coverage support the requested packet.
args:
  goal: string
  snapshot: PacketSnapshot
  plan: PacketPlan
returns: PacketSourcePlan | null
---
Select only an attachment that the current mission approves for this candidate. An earlier PDF or visually approved preview cannot authorize a changed factual claim. Use the page scope stated on the mission, including an explicitly requested page whose absence is material. Use the requested field labels in their given order, joined by comma and one space, as the query. If no usable attachment is authorized, return null.
