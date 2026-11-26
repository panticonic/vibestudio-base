---
description: Explain the requested adoption finding using actual evidence and native continuation feedback.
args:
  goal: string
  card: AdoptionReviewCard
  evidence: AdoptionEvidence
  gate: "AdoptionGate | null"
  receipt: "AdoptionReceipt | null"
  readback: "AdoptionReadback | null"
returns: string
---
Answer the user's actual question or explain the requested local handoff. Use the actual observations and native feedback, with their distinct roles and times. A changed gate is not a failed composition, an attempted record is not a receipt, and a receipt is not evidence that a later readback was performed. Keep any requested facts alongside a successful artifact. Explain a real source/closure conflict, missing evidence or unavailable authority honestly; do not add a generic private status taxonomy or claim an installation occurred.
