---
description: Preserve the distinction between a captured host snapshot, a remote immutable pin and a link awaiting review.
args:
  request: TemplateWorkspaceInput
returns: "review-link" | "capture-snapshot" | "inspect-pin" | "ready"
---
Use review-link for a chooser link. For a host-snapshot use capture-snapshot if it is not captured, then inspect-pin if its exact pin is absent. For Git use inspect-pin when the source pin is missing. A captured host snapshot is reviewed as those bytes once pinned; no fetch of unpublished state is needed. Otherwise return ready.
