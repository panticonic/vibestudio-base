---
description: Verify the local preparation using exact manifest and artwork readback.
args:
  observed: UnitIdentityObservation
  candidate: UnitIdentityCandidate
  change: UnitIdentityChange
returns: '"prepared" | "readback-mismatch"'
---
A prepared result names the same repository and a new revision, matches the candidate's declaration and artworkDigest, and establishes both mainUnchanged and manifestOtherwiseUnchanged. Verify changedFiles names the manifest and the catalog artwork for an image choice, or the manifest alone for an emoji. Otherwise return readback-mismatch.
