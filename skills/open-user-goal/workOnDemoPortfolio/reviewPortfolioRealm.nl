---
description: Review each Regency criterion with the installed settlement or comparison lambda.
args:
  criteria: RealmCriterion[]
  opening: PortfolioFrame
  current: PortfolioFrame
  projection: PortfolioProjection | null
returns: RealmResult[]
---
In order, use current.realm for a saved settlement claim and projection.accounts for a forecast settlement. For a saved comparison use opening.realm and current.realm with basis observed. For a forecast comparison use current.realm and projection.accounts with basis forecast. Preserve assertCommitted. Call reviewer.reviewExample.reviewRealm with the resulting exact request. If a requested forecast has no observation, return not-observed with finding missing-preview and no fabricated evidence IDs for that criterion. Return each criterion and exact review.
