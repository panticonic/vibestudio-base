---
description: Choose the user-authorized action after a retained contract check.
args:
  goal: string
  inquiry: SkillMaintenanceInquiry
  gate: "SkillMaintenanceGate | null"
returns: SkillMaintenanceDecision
budget: { maxTurns: 10 }
---
Interpret the user's requested work using the actual observation and the actual semantic AuthoringReport, including source-specific findings and revision. A missing report is not a positive review; a ready report does not erase a failing native witness. Keep archived evidence distinct from current evidence. Use an acquired native gate for any proposed edit; a query need not acquire write authority. Recommend only supported, requested work and explain the basis or missing evidence. This assessment is advice for the caller's continuation, not a compulsory helper sequence or a completed effect.
