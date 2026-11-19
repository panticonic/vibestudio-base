---
description: Decide whether to stage a resolved identity or report its design.
args:
  candidate: UnitIdentityCandidate
  observed: UnitIdentityObservation
  prepare: boolean
returns: '"prepare" | "design-only" | "already-matches"'
---
If the declaration and artworkDigest both match, return already-matches. Otherwise return prepare when prepare is true and design-only otherwise.
