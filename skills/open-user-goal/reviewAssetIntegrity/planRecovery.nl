---
description: Decide whether to copy any verified originals to private scratch under the user's exact authority.
args:
  goal: string
  versions: AssetVersionRead[]
  findings: AssetFinding[]
returns: AssetRecoveryPlan
budget: { maxTurns: 12 }
---
Determine which edition and asset subset the user's purpose actually authorizes. Use verifyVersion to compare candidate originals with their own edition's manifest and independent file readbacks. Its result establishes exact identity only; it does not choose an edition or grant permission to copy.

Historical editions can legitimately contain different bytes or modes. Different archive and approved digests are not by themselves a contradiction. Do not require cross-edition equality unless the user's request actually requires those editions to match. An archive can establish history without becoming the authorized source for a request about the approved original. Preserve that distinction when choosing the edition and subset. Check the selected edition's observed release status and the user's copy authority. Return verified with a reason for read-only checks that meet the goal. Hold on an unapproved or contradictory source, including an unverified part of a requested all-or-nothing recovery. If the user permits an exact subset, exclude every uncertain asset and explain the limit when reporting. Copy only approved originals with independently verified digest and mode. Use the exact file ID, observed digest and approved output filename. A matching binary in the working tree does not establish authorized lineage.
