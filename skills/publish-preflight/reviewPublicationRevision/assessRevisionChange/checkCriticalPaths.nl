---
description: Identify changed public entry and manifest evidence.
args:
  paths: string[]
  originalEntry: string
  candidateEntry: string
returns: PublicationRevisionImpact
---
Report entryChanged when the entry path differs or either entry appears among the affected paths. Report htmlChanged for index.html and manifestChanged for vibestudio-build.json. Preserve the exact affected paths.
