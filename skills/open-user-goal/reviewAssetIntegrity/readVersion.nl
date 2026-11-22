---
description: Read the version's signed claims and independently inspect all listed contents.
args:
  version: AssetVersion
returns: AssetVersionRead
budget: { maxTurns: 14 }
---
Call listFiles with version.id. Call inspectFile with that id and each listed file ID, including version.dossier. Keep all actual file results in order. Return exactly the version, its files, the actual dossier manifest, and the inspected readbacks. Do not identify a binary asset by path alone.
