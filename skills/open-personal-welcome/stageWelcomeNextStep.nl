---
description: Stage the verified Personal first-run result as an authorized local handoff.
args:
  plan: WelcomePlan
  reviews: WelcomeReviews
returns: WelcomeHandoff | null
---
Call welcomeLocalHandoff.stage with the exact plan and reviews. Return its actual receipt.
