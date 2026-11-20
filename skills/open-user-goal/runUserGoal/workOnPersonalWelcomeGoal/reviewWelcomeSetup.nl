---
description: Use the installed Personal onboarding owner and selection review.
args:
  goal: string
  intent: WelcomeIntent
returns: SetupWitness
---
Call onboarding.planSetup with the exact request containing goal and intent. Preserve the actual plan and return the unchanged request and result.
