---
description: Perform one exact-head local edit or attributable native merge.
args:
  head: string
  operation: ReconcileOperation
returns: ReconcileEffect
---
For kind apply call reconciliationNative.apply with the exact head and edits. For kind merge call reconciliationNative.merge with the exact head and decisions. Return the native result exactly.
