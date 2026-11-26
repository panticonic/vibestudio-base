---
description: Produce actual scoped personal-welcome evidence for the outer coordinator.
args:
  goal: string
  previous: WelcomeInquiry | null
returns: WelcomeInquiry
uses: [workOnPersonalWelcomeGoal/workspace/discoverWelcomeResources, workOnPersonalWelcomeGoal/chooseWelcomeResource, workOnPersonalWelcomeGoal/workspace/readWelcomeFrontier, workOnPersonalWelcomeGoal/workspace/resolveWelcomeResource, workOnPersonalWelcomeGoal/reconcileWelcomeEvidence, workOnPersonalWelcomeGoal/reviewWelcomeSetup, workOnPersonalWelcomeGoal/reviewWelcomeTour, workOnPersonalWelcomeGoal/retryWelcomeProbe]
---
Discover the actual owned resources and choose the relevant current evidence window. Interpret identity, sender, context, revision and resource meaning before trusting a receipt. Use the setup, tour and explorer codebases only where they address this goal; an unrequested review stays null rather than becoming invented evidence.

An exact owned local retry is an effect: execute it only if the user requests it and current native authority admits the original operation, and retain its actual result and cleanup witness. Return the real index, selection, observations, resolution, semantic evidence and reviews for the outer next-step decision. Do not retain the outer handoff or claim completion merely from permission.

When continuing an investigation, preserve actual earlier observations from previous where their identity still matches this owned request. A fresh current read does not replace a historical opening or renew a grant. Use null for an initial inquiry, and pass actual prior inquiry values when refining rather than synthesizing them.
