---
description: Choose a presentation shape for a short readiness review.
args:
  request: PublishPreflightRequest
  blockers: PublishBlocker[]
  receipt: PublicationObservation | null
returns: PublishVisual
---
Choose Compare when the goal explicitly asks to weigh preview against production. Choose Timeline when check-existing asks for publication progress by phase. Choose Checklist when the user asks what to review or must resolve several independent blockers. Use Prose for a simple verdict with one next step. A visual represents the actual decision and evidence, never an invented trend.
