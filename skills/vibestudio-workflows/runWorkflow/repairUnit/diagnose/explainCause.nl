---
description: Explain the source-level mechanism behind observed build or test failures.
args:
  request: UnitRequest
  evidence: Evidence
  source: SourceFile[]
  priorFindings: Diagnosis[]
returns: Diagnosis
---
1. Trace the reported failure from its actual input through the named definitions and returned value. Account for the requested behavior and the unit's existing contracts.
2. State the smallest mechanism that predicts the observed failure. Cite the relevant diagnostic or assertion and source paths. Distinguish downstream consequences from separate defects.
3. Check prior findings and candidate outcomes. Return a new supported hypothesis with the source paths needed to act, or explain the exact missing observation without inventing a result.
