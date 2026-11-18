---
description: Exercise save and discard against the candidate's currently observed saved value.
budget: { maxTurns: 32 }
args:
  expectedRevision: string
  checks: Checks
returns: Verification
---
1. Observe the current panel and confirm its revision equals expectedRevision. Find the controls for the saved view and editor from the current observation. Open the saved view and record its displayed saved value using the resulting after.visibleText. Use the current value as the baseline.
2. Return to the editor. Choose a distinctive probe value different from the baseline and fill the rendered editor field. Activate Save. Open the saved view and compare its actual displayed value with the probe. Use that confirmed new saved value as the baseline for Discard.
3. Return to the editor. Fill another distinctive probe different from the saved value. Activate Discard immediately after filling. Read the field's observed control value as discardedValue. Open the saved view after Discard and record its displayed value as savedAfterDiscard. If the requested checks include switching views, return to the editor and read the field again as reopenedValue.
4. Each time an action changes what is rendered, use its after observation to choose the next control. Use the exact role and name from after.controls. If a control or generation changes before an action, reobserve; account for any action already delivered. Use after.visibleText for saved-view comparisons.
5. Compute savedMatches from the saved view visibly displaying the exact new Save probe. Compute discardMatches from both discardedValue matching savedProbe and savedAfterDiscard visibly displaying that same probe. If you reopened the editor, compute reopenMatches as reopenedValue === savedProbe. Return passed as revisionMatches && savedMatches && discardMatches && reopenMatches, using true for reopenMatches when that check is inapplicable. Include the probe, the restored editor value, and the saved view observed after Discard in the evidence.
