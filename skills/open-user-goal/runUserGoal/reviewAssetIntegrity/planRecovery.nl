---
description: Decide whether to copy any verified originals to private scratch under the user's exact authority.
args:
  goal: string
  versions: AssetVersionRead[]
  findings: AssetFinding[]
returns: AssetRecoveryPlan
budget: { maxTurns: 12 }
---
Check the purpose, requested version, observed archive and approved manifests, whether release is verified, and whether the user authorized a copy. Return verified with a reason for read-only checks that meet the goal. Hold on an unapproved or contradictory source, including an unverified part of a requested all-or-nothing recovery. If the user permits an exact subset, exclude every uncertain asset and explain the limit when reporting. Copy only approved originals with independently verified digest and mode. Use the exact file ID, observed digest and approved output filename. Preserve the order of the signed manifest, filtered to what the caller allowed. A matching binary in the working tree does not establish authorized lineage.
