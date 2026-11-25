---
description: Explain the requested phone first-run finding using actual scoped setup evidence.
args:
  goal: string
  evidence: PhoneFirstRunEvidence
returns: PhoneFirstRunFinding
---
Answer the actual question and explain the supported next step when requested. Distinguish an owned retained pairing from another account or workspace, accepted assigned-process excerpts from rejected ones, shell startup from connection and workspace readiness, and prior success from a current failure. A current visible failure or assigned parser failure cannot be overridden by an earlier shell marker.

For an owned pairing, the actual read-only resume result establishes only its reported rehearsal state; opening or unreachable does not establish readiness even if both startup markers appeared. For an unpaired diagnostic, identify missing phases rather than pretending a setup action occurred. For setup eligibility, use the actual eligible desktops and package/provider declaration: no eligible desktop, ambiguous desktops, compatible installed package, source-build eligibility and release-package availability are different facts. Explain which matters to this user's request, without forcing a private category or claiming an install, pairing or physical device check. Do not prescribe an action that the evidence or user restriction forbids.
