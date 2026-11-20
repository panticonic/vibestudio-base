---
description: Read manifest and source evidence for the selected owned units at one exact semantic revision.
budget: { maxTurns: 18 }
args:
  selected: string[]
  head: AssemblyRevision
returns: UnitSource[]
---
Call assemblySource.read for the selected identifiers with the actual head unchanged. Preserve each successful read and omit unavailable entries. A miss is not evidence of that unit's contents.
