---
description: Exercise save and discard against the candidate's currently observed saved value.
args:
  expectedRevision: string
  checks: Checks
returns: Verification
---
1. Observe the current panel and confirm its revision equals expectedRevision. Find the controls for the saved view and editor from the current observation. Open the saved view and record its displayed saved value using the resulting after.visibleText. Use the current value as the baseline.
2. Return to the editor. Choose a distinctive probe value different from the baseline and fill the rendered editor field. Activate Save. Open the saved view and compare its actual displayed value with the probe. Use that confirmed new saved value as the baseline for Discard.
3. Return to the editor. Fill another distinctive probe different from the saved value. Activate Discard. Inspect the editor field by its current role and name and verify that its observed control value equals the saved value. If the requested checks include switching views, also confirm the discarded probe stays discarded after a view change.
4. Each time an action changes what is rendered, use its after observation to choose the next control. Use the exact role and name from after.controls. If a control or generation changes before an action, reobserve; account for any action already delivered. Use after.visibleText for saved-view comparisons.
5. Return passed and evidence for the applicable Save and Discard checks. A failed check is passed:false with the actual observed value. The baseline comes from the running panel and can be established at any point in its lifecycle.
