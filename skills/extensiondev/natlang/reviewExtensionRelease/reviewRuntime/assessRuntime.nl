---
description: Separate an approval, build, error, cold runtime or live method observation.
args:
  observation: ExtensionRuntime
  method: string
returns: 'ExtensionRuntimeReview["disposition"]'
---
1. Pending approval or pending-approval status yields waiting-approval. Building yields building. Error status or hasError yields failed.
2. Without a running status, identity and activeEv, return cold.
3. For a running build use the exact live method list. Return live-method when it contains method. Otherwise return method-not-observed.
