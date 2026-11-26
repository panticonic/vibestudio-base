---
description: Combine both demos' exact acceptance evidence into the requested private outcome.
args:
  goal: string
  current: PortfolioFrame
  plan: PortfolioPlan
  garden: GardenResult[]
  realm: RealmResult[]
returns: PortfolioDecision
---
Decide ready when every requested criterion in both demos is supported. If any criterion is contradicted decide blocked. Otherwise decide incomplete when evidence is missing. Set write when the plan explicitly requests a diagnostic note for this decision or a ready-only note and the result is ready. Explain concrete reasons for both demos, including the current acceptance card if its content changed the decision. Preserve the distinction between projected and saved claims.
