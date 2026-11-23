---
description: Interpret the user's conditional request for a private configuration finding.
args:
  goal: string
  brief: ConfigBrief
  outcome: ConfigOutcome
returns: boolean
---
Return true only when the user explicitly authorizes a private local record of this configuration review and every condition they attach is satisfied by the actual outcome. A request for an explanation, a deployment, a setting change or a different workspace does not authorize this private record. Respect a requested hold. Return false otherwise.
