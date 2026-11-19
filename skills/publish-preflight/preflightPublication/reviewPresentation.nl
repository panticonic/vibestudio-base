---
description: Relate observed panel labels and captions to the public audience.
args:
  request: PublishPreflightRequest
  presentation: PresentationObservation
returns: PreflightReview
---
If matchesPanelAttempt is false, return stale-panel and explain that the capture belongs to a different or incomplete attempt. Otherwise call assessPublicLabels for the public audience and return its assessment. Only cite probes on the reviewed attempt.
