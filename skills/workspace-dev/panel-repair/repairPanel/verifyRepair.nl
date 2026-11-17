---
description: Determine whether a rebuilt panel satisfies the live interaction contract.
args:
  request: Request
  reproduction: Reproduction
  candidate: Observation
  checks: Checks
returns: Verification
---
1. Confirm the observation is the rebuilt candidate. Use panelRepair.interact on its generation to exercise the original behavior, with control names taken from the new rendered state.
2. Exercise checks.preserveBehavior as well as checks.requiredBehavior. Check the observed state after each action.
3. Return the observed evidence and pass only when it establishes the requested behavior and the preservation checks. Include any failure clearly enough for another diagnosis.
