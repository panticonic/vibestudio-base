---
description: Order assigned answer sections by their role in the caller's goal.
args:
  request: PresentationRequest
returns: string[]
budget: { maxTurns: 6 }
---
Use only request.sections and return their ids. Include every required section. Include a supplementary section only when it directly addresses request.goal. A section can be relevant even if its facts are incomplete. Start with the primary answer or decision, then place supporting evidence and follow-up views after the parts they refer to. Preserve input order when the goal gives no ordering dependency. Do not combine sections or make up additional ids.
