---
description: Assess exact accepted effects, first faults, secondary cleanup and local staging authority.
args:
  assignment: ReleaseAssignment
  cases: CaseEvidence[]
returns: ReleaseAssessment
---
1. If any required case is missing or uninstalled, or any passing case lacks an exact witness, return hold-evidence. Decisive names are the required cases with these gaps, in assignment order.
2. Otherwise use every required case with a primary failure or a cleanup problem, in assignment order. If any have an issue and a diagnosis is authorized, choose stage-diagnostics. If a diagnosis is not authorized, choose hold-failure if a primary fault exists or hold-cleanup if cleanup is the only issue. Explain the primary fault distinctly from secondary cleanup.
3. If all required cases have exact passing witnesses and no unexpected fault or cleanup issue, choose stage-acceptance when authorized, or report-only. For either, include all required case names in order. A deliberately expected negative result cannot qualify as a primary fault.
4. Ground the reason in the received facts. Return only the disposition, ordered decisive case names and reason.
