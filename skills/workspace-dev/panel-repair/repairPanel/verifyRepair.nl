---
description: Verify the rebuilt panel by exercising the reported behavior and affected neighboring behavior.
args:
  request: Request
  reproduction: Reproduction
  candidate: Observation
  checks: Checks
returns: Verification
---
1. Observe the current panel. Check its revision against candidate.revision. Repeat the reported interaction on that candidate using only rendered controls from the current generation. Gather evidence from the returned observations after each action. Finish the replay and read its final control value before starting the next check.
2. If the preservation checks cover Save or Discard, await verifySaveAndDiscard(candidate.revision, checks) to completion before any further browser observations or actions. The child establishes its own current saved value.
3. For any other preservation checks, exercise them on the current candidate. View display-only values in after.visibleText from the action observations. Inspect a form field by using its exact role and name and reading the resulting control value.
4. Compute passed from the conjunction of the applicable observed checks, including the child's boolean when it ran. Return that boolean and the observations supporting it. Use passed:false and the specific failed check when behavior differs or evidence is incomplete. This function operates the browser and returns observations. Source edits belong to the repair workflow.
