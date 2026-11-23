---
description: Audit the assigned Android device or installed application without changing either.
args:
  goal: string
returns: AndroidGoalAuditReport
---
Read the exact assigned scope using readAndroidAuditScope. Call planAndroidGoalAudit with the original goal and the scope. Run installed.auditAndroidRuntime with that exact request. Return the actual installed audit report directly, preserving device connection, app state and workspace readiness as distinct findings.
