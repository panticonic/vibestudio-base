---
description: Decide whether the same publication or its hosted readback can be retried within the user's scope.
args:
  goal: string
  progress: OwnedPreviewProgress
  readback: 'OwnedPreviewReadback | null'
returns: '"resume" | "readback" | "stop"'
---
For a submitted operation with pending readback, refresh the same readback if the user asked to verify it. For a retryable advance that did not submit, resume the same sealed operation if publication and retry are authorized by the goal. Respect any explicit stop and preserve the actual durable receipt.
