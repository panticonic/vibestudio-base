---
description: Decide the safe next step for an owned phone first-run rehearsal.
args:
  goal: string
returns: PhoneFirstRunOutcome
budget: { maxTurns: 18 }
---
1. Call locatePhoneRehearsal with the unchanged goal. Call readPhoneEvidence with its exact current card ID.
2. For an owned retained pairing with an actual non-null setupRequest, call phoneSetup.setUpPhone with that exact request. This is the installed resume workflow. Otherwise set resume to null.
3. Pass the original goal and evidence {card, assignment, startup, build, resume} to decidePhoneFirstRun. Return its decision with the real evidence under scope "owned-phone-eligibility-rehearsal". Make no device or workspace changes.
