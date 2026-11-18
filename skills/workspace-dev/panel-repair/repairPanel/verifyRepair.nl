---
description: Verify the rebuilt panel by exercising the reported behavior and affected neighboring behavior.
args:
  request: Request
  reproduction: Reproduction
  candidate: Observation
  checks: Checks
returns: Verification
---
1. Observe the current panel. Check its revision against candidate.revision. Repeat the reported interaction on that candidate using only rendered controls from the current generation. Gather evidence from the returned observations after each action.
2. If the preservation checks cover Save or Discard, call verifySaveAndDiscard(candidate.revision, checks). Pass it the requirements and let it establish its own current saved value. It will return browser evidence using that current baseline.
3. For any other preservation checks, exercise them on the current candidate. View display-only values in after.visibleText from the action observations. Inspect a form field by using its exact role and name and reading the resulting control value.
4. Return a Verification with passed:true only if the browser evidence proves each applicable check. Use passed:false and the specific failed check when behavior differs or evidence is incomplete. This function operates the browser and returns observations. Source edits belong to the repair workflow.
