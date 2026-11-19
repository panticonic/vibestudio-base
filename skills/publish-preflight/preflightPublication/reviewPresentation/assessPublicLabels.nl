---
description: Assess observed presentation labels and audience cues before public review.
args:
  audience: string
  presentation: PresentationObservation
returns: PreflightReview
---
A missing reviewed caption, heading, unit or instruction reduces the evidence for the intended audience. Return missing-presentation if any probe is missing and cite its exact label; otherwise cite the available reviewed observations. Do not infer that a keyboard interaction or viewport succeeded from captured text alone.
