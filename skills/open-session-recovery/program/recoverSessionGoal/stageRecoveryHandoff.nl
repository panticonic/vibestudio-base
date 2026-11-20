---
description: Stage the user's requested handoff from the verified recovery findings.
args:
  review: RecoveryFinding
returns: 'RecoveryArtifact | null'
---
When the review provides a continue or hold decision backed by observed notes, call recoveryHandoff.stage with the exact review. Otherwise return null. Return the actual readback receipt unchanged.
