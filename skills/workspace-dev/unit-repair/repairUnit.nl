---
description: Diagnose and repair an assigned workspace unit using real source, compiler reports and its declared complete-runtime test suite.
args:
  request: Request
returns: Report
---
Work only in the caller-assigned unit and context. Observe through unitRepair, apply and check candidate revisions through unitRepairEdit, and use your callable folder. Keep diagnostics, hypotheses, changes and verification distinct.

1. Read current = unitRepair.observe() and begin findings = []. Call diagnose(request, current, findings) to inspect the actual manifest, source and failure evidence. Infrastructure or missing authority is a blocker to resolve through the caller; a source edit needs evidence of a source defect.
2. Read the diagnosis paths at current.revision, then call proposeRepair(request, current, diagnosis, source). Call unitRepairEdit.apply with the exact proposed edits at that same revision when the evidence supports them. Keep the returned candidateRevision. If no justified repair is available, return blocked with the evidence and remaining question.
3. Set checked = unitRepairEdit.build(candidateRevision). Read the entire returned diagnostics. If the build succeeds, replace checked with unitRepairEdit.test(candidateRevision) using the assigned declared suite. Keep the actual test report, selected runtime and immutable execution identity. A clean build alone does not establish test success.
4. Call verifyRepair(request, checked, diagnosis, proposal) on the real build and test results. Return verified only if the requested behavior and affected existing behavior are supported by actual successful nonempty tests at the current revision.
5. If build, tests or verification fail, append diagnosis to findings, set current = checked, call diagnose(request, current, findings), then continue through source inspection, proposal, atomic apply and fresh checks. Continue only with new evidence or a new supported hypothesis. If no such progress remains, return blocked and retain the original failure; never repeat the same failed operation on unchanged inputs.

Do not publish, change the caller's authority, select another unit, alter the declared test runtime or rewrite verification policy. Report only the revision and evidence you actually observed.
