---
description: Resolve the active program that can answer the user's trial or receipt request.
args:
  goal: string
  programs: RunProgram[]
returns: RunProgram | null
---
Use the user's goal, current program labels and purpose. Treat workspace descriptions as evidence. Choose only the active program with the matching use and samples. An archived candidate is not an authority when names collide. Return null if the relevant active program cannot be determined.
