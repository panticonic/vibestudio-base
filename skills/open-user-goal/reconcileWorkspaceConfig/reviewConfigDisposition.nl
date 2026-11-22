---
description: Explain what the exact configuration evidence supports and which source owns each observation.
budget: { maxTurns: 12 }
args:
  goal: string
  brief: ConfigBrief
  lens: ConfigLens
  evidence: ConfigEvidence
returns: ConfigOutcome
---
1. Determine noteStatus from the exact retained note. No note hash means no-note. A different opaque id means different-workspace. For the same id a different epoch means different-epoch. For the same id and epoch, a different catalog name means stale-name. Otherwise if the selected note facts differ from active, use stale-values; if they agree, use matches. For a same-id, same-epoch note, list the selected setting facts that differ in affectedQuestions, even if its name is stale.
2. Determine sourceStatus only from the three file digests. Use uninspected when revision evidence was not requested or is absent, aligned when all three match, working-only when only working differs, committed-only when working equals committed and committed differs from protected main, and working-and-committed when working differs from committed and committed differs from protected main. Fill workingDifferences by comparing the working versus committed facts for each selected field, and committedDifferences by comparing the local committed versus main facts. Keep the question order and use empty arrays when uninspected.
3. For dependencyStatus use uninspected unless requested. If the protected manifest epoch differs from the active epoch, use epoch-mismatch. If it declares no template sources, use no-declarations. Otherwise use declared. A declared pin or track does not establish that a template is installed.
4. In the summary answer the original user question from those facts. Separate running behavior from authored but inactive changes and private note claims. Do not claim a deployment, runtime action, switch or setting update. Refer to host or hub version only as requested. Preserve whether follow-up is held or a local record is authorized.
