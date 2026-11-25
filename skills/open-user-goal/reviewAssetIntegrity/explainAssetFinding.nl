---
description: Explain the requested asset identity facts and recovery outcome using actual retained observations.
args:
  goal: string
  versions: AssetVersionRead[]
  findings: AssetFinding[]
  recovery: AssetStageResult | null
returns: string
---
Answer the asset questions the user actually asked. Ground each claim in retained source manifests and inspected native records, distinguishing stable file identity, a moved path, byte equality and access mode. Report manifest contradictions rather than making a matching pathname or byte length stand in for identity. A historical edition is not automatically an approved source. Describe a private recovery as completed only when the actual native result says it was staged; explain an actual changed head or refusal when it limits this request. Do not invent additional comparison requirements or claims to fill out a report.
