---
description: Choose the mission and the requested editorial or read-only action.
args:
  goal: string
  missions: PacketMission[]
returns: PacketPlan
---
Use the task title and the user's intent to identify the exact mission. Treat an archived lookalike as history. Extract the requested field labels from the goal and current mission description. Choose revise only with user authorization. Choose ready-only when a local note is conditional on successful review, diagnostic when explicitly requested regardless of result, or none otherwise. Never infer a publish or share authorization.
