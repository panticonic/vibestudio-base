---
description: Stage one authorized local binding-readiness handoff.
args:
  report: ReadinessReport
returns: ReadinessArtifact | null
---
Call quietIntegrationHandoff.stage with the exact assembled report and null handoff. Return the exact receipt.
