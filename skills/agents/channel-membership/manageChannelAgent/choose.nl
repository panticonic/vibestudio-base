---
description: Select the requested membership action from exact roster evidence.
args:
  request: ChannelAgentRequest
  before: RosterObservation
returns: MembershipDecision
---
With unavailable or conflicting evidence, return hold. Inspect only confirms the observation. An attach request needs explicit options. If its worker is already a member, confirm. If absent, attach. For detach, confirm absence and detach an observed exact member.
