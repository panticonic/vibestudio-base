---
description: Compare one signed asset's coordinate, path, bytes and mode with the working materialization.
args:
  claim: AssetManifestRow
  approved: AssetVersionRead
  working: AssetVersionRead
returns: AssetFinding
budget: { maxTurns: 12 }
---
Find the signed original by claim.path in the approved inspected files. Compare the original with claim.digest and claim.mode. Record manifest if absent or if those do not match. When the original exists, try its stable file ID in the working inspected files. If the ID survived, record moved for a changed path, bytes for a changed exact digest, and mode for changed mode, in that order. If the ID disappeared, record replaced if another ID occupies the original path, otherwise missing. Same requires exact agreement and no other differences. Return claim.key and the actual signed and current IDs or null. Include the manifest difference after other differences if it also applies.
