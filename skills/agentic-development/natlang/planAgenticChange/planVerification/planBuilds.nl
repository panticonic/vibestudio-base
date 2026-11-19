---
description: Identify affected package checks and the runnable units that must use the changed source.
args:
  impact: AgenticImpact
returns: AgenticBuildPlan
---
Include the owner and changed consumers in focusedTests. Select the affected runnable units from panels/chat, workers/agent-worker and workers/pubsub-channel for rebuild, including consumers of edited packages. A package test does not rebuild a running agent or panel. Treat the retained-history tests in the impact as part of the focused checks.
