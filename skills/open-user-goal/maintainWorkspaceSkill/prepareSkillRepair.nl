---
description: Draft and stage only the exact local reusable skill repairs requested.
args:
  goal: string
  inquiry: SkillMaintenanceInquiry
returns: SkillMaintenanceReceipt
---
Use draftSkillChanges with the actual goal and inquiry. Carry the actual semantic report findings into the draft instead of silently dropping them. Stage its actual changes against inquiry.observation using the exact native helper. Return the native receipt or refusal; never synthesize a successful patch. This helper owns only the requested patch boundary, not the whole maintenance route.
