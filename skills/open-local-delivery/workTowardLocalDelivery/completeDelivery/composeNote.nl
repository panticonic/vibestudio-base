---
description: Draft the requested local note using verified facts without broadening the audience.
args:
  goal: string
  observations: LocalObservation[]
  target: LocalObservation
returns: string
---
Return only the requested note text. Include the exact approved facts, version and requested next action supported by the goal and observations. Qualify uncertainty if the user's authorized note asks for it. Keep mentions and any new recipients out of the body. The separate current roster selection determines the only receiver.
