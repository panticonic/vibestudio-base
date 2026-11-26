---
description: Answer the audience's question and provide the grounded presentation or interaction their goal calls for.
args:
  goal: string
returns: AudienceResult
---
Own the audience's goal. Establish the current local facts and the decision or activity the reader needs help with. Delegate investigation of the record and suitable response medium through reviewAudienceNeed when useful, retaining its actual record and reasoning. The available hierarchy also supports grounded answers and presentation preparation; choose the work that serves this request rather than following a fixed sequence of classifications.

A requested comparison, trend, exploration or varying input may need a usable view or interaction as well as prose. An explicit request for exact data still needs the requested values. A text-only or single-fact request may finish with an answer alone. Use only recorded facts and supported bounded models; do not invent inputs, controls or a successful presentation. When a presentation serves the goal, let prepareAudienceVisual use the installed visualization hierarchy and render it through the exact native workspace boundary. Consume its actual receipt or refusal before deciding whether the requested work is complete.

Return applicationResult with the requested answer and only an actual presentation receipt, or null. Explain missing data or unavailable interaction honestly. Permission to render is not a requirement to create a view for a goal that does not benefit from one.
