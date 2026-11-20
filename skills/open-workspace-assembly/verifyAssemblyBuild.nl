---
description: Verify one selected package build and read its retained native build artifact metadata.
args:
  unit: string
  head: AssemblyRevision
returns: AssemblyBuildReceipt | null
---
Call assemblyBuild.verify with the exact unit and reviewed current head. Return its actual result or null.
