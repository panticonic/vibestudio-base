---
description: Test whether the actual two workspace intentions can coexist.
args:
  request: Request
  initial: Snapshot
returns: string[]
---
1. Identify the concrete data or behavior changed by each side from its record and actual files.
2. Explain which changes are independent, which can be composed, and which require a choice absent from the request.
3. Return concise evidence statements. Distinguish an implementation overlap from contradictory intended behavior; a shared file alone establishes neither incompatibility nor a winner.
