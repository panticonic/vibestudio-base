---
description: Specify the behavioral probe and exact observations for a same-context canary.
args:
  goal: string
  surface: AgenticCanarySurface
returns: AgenticCanaryProbe
---
Plan one bounded action on a fresh surface in the assigned context that would distinguish the requested behavior from the current behavior. Name the exact observations needed, such as visible capability, attributed invocation outcome, admitted observation, or retained terminal and replay. Use observations appropriate to the goal. Treat these as evidence to collect during execution.
