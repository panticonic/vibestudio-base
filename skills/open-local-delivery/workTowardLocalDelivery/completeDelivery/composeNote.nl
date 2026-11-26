---
description: Draft the requested local note using verified facts without broadening the audience.
args:
  goal: string
  observations: LocalObservation[]
  target: LocalObservation
returns: string
---
Return only the requested note text. Include the exact approved facts, version and requested next action supported by the goal and observations. Qualify uncertainty if the user's authorized note asks for it. Preserve any literal names or @mentions the user requested in the note text; they are body content, not additional addressees. The separately bound current roster selection determines the only receiver. Do not expand that recipient set.
