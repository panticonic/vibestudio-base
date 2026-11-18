---
description: Decide if the observed evidence supports a candidate inference or establishes a rejected change.
args:
  vote: EvidenceVote
  boundary: ProvenanceRefusal
returns: {status:"supported"|"rejected"|"inconclusive"|"narrow-scope"; evidence:string[]}
---
When a relevant recorded rejection exists, return rejected with the exact rejection refs. When there is contradicting evidence, return inconclusive with its refs. Return supported with the supporting refs only when at least two independent related observations support it. Otherwise return inconclusive with the visible supporting or historic refs. Where nothing visible supports an inference, return an empty list. Never infer that there is no earlier cause across a visibility boundary.
